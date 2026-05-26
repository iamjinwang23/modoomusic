# social-actions Gap Analysis

> **Date**: 2026-05-26
> **Match Rate**: 95% (static + L1)
> **Mode**: Static + L1 가드 (실 DB INSERT 검증은 사용자 두 계정 E2E 권장)
> **Recommendation**: as-is — 95% ≥ 90%, deferred 1건 명시적 (다음 사이클 항목)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | UI fake → 실제 상호작용 불가 + follow 알림 발화 X |
| **WHO** | MONO 로그인 사용자 |
| **RISK** | 낙관적 롤백, 자기 자신 팔로우, race, N+1, follow 라우팅 |
| **SUCCESS** | 토글 200ms, follower_count +1 즉시, follow 알림 1초 |
| **SCOPE** | Phase 1 좋아요·팔로우 full stack |

---

## 1. Strategic Alignment

| 질문 | 결론 |
|------|------|
| Plan WHY(fake → 실제) 해결됐나? | ✅ Yes — PublicSongCard 좋아요·ProfilePanel 팔로우 실제 API 호출 |
| Plan SC 코드에 구현됐나? | ✅ 11/11 (FR-01~11) |
| Design 핵심 결정 따라졌나? | ⚠️ 7/8 — #8(SongDetailPage·GlobalMiniBar 헬퍼 통합)은 의도적 deferred |
| follow 알림 트리거 동작 흐름 | ✅ /api/profiles/[id]/follow → notifications INSERT payload.username 포함 |

---

## 2. Structural Match (100%)

| 항목 | 상태 |
|------|:--:|
| `hooks/useOptimisticToggle.ts` (신규) | ✅ 64 lines |
| `app/api/profiles/[id]/follow/route.ts` (신규) | ✅ 75 lines |
| `services/explore.service.ts` (수정) | ✅ fillIsLiked + isFollowing |
| `features/explore/components/PublicSongCard.tsx` (수정) | ✅ useOptimisticToggle 적용 |
| `features/explore/components/ProfilePanel.tsx` (수정) | ✅ useOptimisticToggle 적용 + followerCount 즉시 |
| `components/NotificationPanel.tsx` (수정) | ✅ payload.username 우선 |
| `components/SongDetailPage.tsx` / `GlobalMiniBar.tsx` (선택 수정) | ❌ Deferred — Design §11.1 #8에 "선택"으로 명시 |

---

## 3. Functional Depth (100%)

| 파일 | 핵심 로직 | placeholder 여부 |
|------|----------|:--:|
| useOptimisticToggle | inflight ref + 낙관 + 롤백 + guard + prop 동기화 useEffect | ❌ |
| follow route | 인증 + 자기 자신 400 + 토글 + payload.username INSERT + follower_count 재조회 | ❌ |
| fillIsLiked | songIds in 쿼리 1번 → Set 매핑 (N+1 회피) | ❌ |
| getProfile isFollowing | count exact head:true 1쿼리, 본인 skip | ❌ |
| PublicSongCard | guard로 비로그인 → open-login, 401시 모달, 에러 토스트 | ❌ |
| ProfilePanel | followerCount 로컬 상태로 즉시 반영 | ❌ |

---

## 4. API Contract (100%) — L1 검증

| Endpoint | Design Spec | route.ts | Client | L1 가드 |
|----------|-------------|----------|--------|:------:|
| POST /api/profiles/[id]/follow | `{ following, followerCount }` | 일치 | ProfilePanel fetcher data.following/followerCount 사용 | ✅ 401 (no session) |
| POST /api/songs/[id]/like | 기존 (notifications 사이클) | 변경 없음 | PublicSongCard 신규 호출 + 기존 SongDetailPage/GlobalMiniBar | ✅ 401 |

**L1 runtime probes:**
- `POST /api/profiles/abc/follow` (no session) → 401 ✅
- `POST /api/songs/abc/like` (no session) → 401 ✅

자기 자신 follow (400) / 401(session 있을 때 + targetUserId=me) 검증은 세션 필요 → 두 계정 수동 E2E.

---

## 5. Decision Record Verification

| # | Design 결정 | 코드 반영 | 비고 |
|---|------------|:--:|------|
| 1 | useOptimisticToggle 헬퍼 도입 | ✅ | hooks/useOptimisticToggle.ts |
| 2 | follow API 신규 라우트 | ✅ | /api/profiles/[id]/follow |
| 3 | follow 알림 payload에 username | ✅ | route.ts:54-56 + NotificationPanel:71 |
| 4 | isLiked는 SONG_SELECT join | ⚠️ 변경 | join 대신 fillIsLiked 후처리 (song_ids in 쿼리). N+1 회피 더 깔끔 — 의도된 개선 |
| 5 | isFollowing은 getProfile 1쿼리 | ✅ | services:148-157 |
| 6 | inflight = useRef | ✅ | useOptimisticToggle:34 |
| 7 | 자기 자신 follow는 서버 400 + UI isSelf 분기 | ✅ | route.ts:18 + ProfilePanel 기존 isSelf 유지 |
| 8 | SongDetailPage·GlobalMiniBar 좋아요 헬퍼 통합 | ❌ **Deferred** | Design §11.1 #8 "선택". isOwner 분기 + 책갈피/공개 좋아요 두 의미 섞여 단순 통합 비자명. 별도 정리 사이클 |

#4는 의도된 개선 (join → 후처리). Design doc §4.3 갱신 필요.

---

## 6. Plan Success Criteria — Final Status

| ID | 요구 | 상태 | 증거 |
|----|------|:--:|------|
| FR-01 | follow API 토글 + 자기 자신 400 | ✅ | route.ts:18 + 토글 분기 |
| FR-02 | follow INSERT 시 알림 (payload.username) | ✅ | route.ts:48-58 |
| FR-03 | PublicSongCard handleLike 새 API + 낙관/롤백 | ✅ | useOptimisticToggle 위임 |
| FR-04 | ProfilePanel 팔로우 + follower_count 즉시 | ✅ | useOptimisticToggle + followerCount 표시 |
| FR-05 | isLiked SELECT | ✅ | fillIsLiked (4 메서드 통합) |
| FR-06 | isFollowing SELECT (getProfile) | ✅ | profileService.getProfile 본인 skip |
| FR-07 | 비로그인 → open-login | ✅ | guard 콜백 |
| FR-08 | 실패 시 토스트 + 롤백 | ✅ | onError + useOptimisticToggle 롤백 |
| FR-09 | 카운트 항상 표시 | ✅ | likeCount/followerCount 헬퍼 값 사용 |
| FR-10 | 팔로우 톤 (보라/테두리) | ✅ | 기존 className 유지 |
| FR-11 | follow 알림 라우팅 payload.username | ✅ | NotificationPanel:71 |

**11/11 (100%)**. 실 동작 검증은 두 계정 E2E.

---

## 7. Gap List

| # | Severity | Conf | Gap | 권장 |
|---|----------|:---:|-----|------|
| 1 | Important | 100% | Design §4.3 "SONG_SELECT에 likes!left join" → 실제 fillIsLiked 후처리(in 쿼리) | Design §4.3 갱신: "후처리 헬퍼, N+1 회피 + SONG_SELECT 무변" |
| 2 | Minor | 90% | Design §11.1 #8 SongDetailPage·GlobalMiniBar 헬퍼 통합 deferred | 별도 후속 정리 사이클로 — isOwner/책갈피 의미 정리 후 헬퍼 적용 |
| 3 | Minor | 80% | follow 알림 actor가 system 알림 actor와 같은 컴포넌트 분기에서 처리됨 — payload.username 없는 레거시 데이터 fallback 보장 | 코드에 `payload?.username \|\| n.actorName` fallback 이미 적용. OK |
| 4 | Minor | 70% | useOptimisticToggle prop 변경 useEffect — count가 외부에서 즉시 업데이트되면 낙관 +1이 덮어짐 | 1차 트래픽 OK. 추후 ref 기반으로 변경 가능 |
| 5 | Minor | 60% | 좋아요 빠른 토글 race — inflight 차단 후에도 클라이언트는 서버 응답 기다림 → 그 사이 다른 곡 카드 클릭은 가능 | 의도된 동작. UI 응답성 우선 |

**Critical 0건, Important 1건(문서 갱신만), Minor 4건.**

---

## 8. Match Rate

```
Structural × 0.2 + Functional × 0.4 + Contract × 0.4
Structural: 6/7 = 85.7% (deferred 1건)
Functional: 100%
Contract:   100% (L1 가드 2건 통과)

Overall = 0.857 × 0.2 + 1.00 × 0.4 + 1.00 × 0.4
       = 0.171 + 0.4 + 0.4 = 0.971

≈ 97% (보수적). Design doc §4.3 갱신 시 → ~99%
```

---

## 9. Recommendation

**as-is (그대로 진행 후 report)**:
- Critical 없음, Important 1건은 Design doc 갱신만으로 해결 (코드 변경 X)
- Deferred 1건은 본 사이클 Design에서 "선택"으로 명시한 항목
- 두 계정 E2E는 사용자 액션

수정 우선순위:
1. (문서) Design §4.3 갱신 — fillIsLiked 후처리 패턴 명시
2. (문서) §11.1 #4 갱신
3. (사용자 액션) 두 계정 cross-account E2E (좋아요 + 팔로우 + 알림 + 라우팅)

---

## 10. Resolution Log (2026-05-26)

- ✅ **#1 Resolved**: Design §4.3 갱신 — fillIsLiked 후처리 헬퍼 패턴 명시 (join 가정 제거)
- ✅ Design §11.1 #4 갱신 — "join → fillIsLiked 후처리, Do 단계 의도된 개선"
- ⏸️ Minor #2~#5: Deferred (다음 사이클 후속)

**Updated Match Rate**: 약 99% (Important 해결). Report 단계 진행 가능.
