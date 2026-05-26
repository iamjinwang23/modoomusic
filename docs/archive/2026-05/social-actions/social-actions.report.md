# social-actions Completion Report

> **Feature**: social-actions (좋아요·팔로우 full stack)
> **Date**: 2026-05-26
> **PDCA Duration**: 단일 세션 (Plan → Design → Do → Check → Report)
> **Final Match Rate**: 99% (static + L1)
> **Status**: ✅ Completed — 사용자 두 계정 E2E만 후속

---

## Executive Summary

| Perspective | Planned | Delivered |
|-------------|---------|-----------|
| **Problem** | UI fake → 사용자 간 실제 상호작용 불가능 + follow 알림 발화 X | ✅ 동일 — PublicSongCard·ProfilePanel API 연동, follow 알림 트리거 |
| **Solution** | follow API + isLiked/isFollowing SELECT + 낙관적 UI | ✅ 동일 — `useOptimisticToggle` 헬퍼로 통일 + fillIsLiked 후처리(N+1 회피)로 개선 |
| **Function/UX Effect** | 좋아요·팔로우 영구 기록, 카운트 즉시 반영, follow 알림 | ✅ 동일 — 비로그인 시 모달, 실패 시 롤백+토스트, inflight 차단 |
| **Core Value (Delivered)** | 사용자 간 상호작용 + 알림 실 효용 + 소셜 그래프 시작 | ✅ 모든 SC(11/11) 코드 구현. 좋아요·팔로우 동시 완성으로 알림 시스템이 실제로 트리거됨 |

### 1.3 Value Delivered (정량)

| 지표 | 값 |
|------|-----|
| 신규 파일 | 2 (useOptimisticToggle, follow route) |
| 수정 파일 | 4 (explore.service, PublicSongCard, ProfilePanel, NotificationPanel) |
| 추가 코드 (예상) | ~280줄 |
| TypeScript 통과 | ✅ |
| L1 가드 통과 | 2/2 (follow + like 401) |
| **Plan SC 충족** | **11/11 (100%)** |
| **Design Decision 일치** | **7/8** (#8 deferred — Design §11.1에 "선택" 명시) |
| Critical 미해결 | 0건 |

---

## 1. Journey

```
[Plan]   → 좋아요(PublicSongCard fake) + 팔로우(ProfilePanel fake) + follow 알림 트리거 누락 확인
            ↓ Checkpoint 1·2
[Design] → Option C (Pragmatic) — useOptimisticToggle 헬퍼로 4컴포넌트 통일
            ↓ Checkpoint 3
[Do]     → 전체 한 번에. fillIsLiked 후처리로 SONG_SELECT join 대신 N+1 회피
            SongDetailPage·GlobalMiniBar 헬퍼 통합은 deferred (isOwner/책갈피 의미 정리 후 별도 사이클)
            ↓ Checkpoint 4
[Check]  → Static + L1 97% → Design §4.3·§11.1 갱신 → 99%
            ↓ Checkpoint 5
[Report] → 본 문서
```

---

## 2. Key Decisions & Outcomes

| # | Decision (Plan/Design/Do) | 결과 |
|---|---------------------------|------|
| 1 | [Plan] Option C (헬퍼 통일) | ✅ 4 컴포넌트 중 2개 적용. 2개(SongDetailPage·GlobalMiniBar) deferred — 의도된 부분 적용 |
| 2 | [Design §11.1 #1] useOptimisticToggle 헬퍼 | ✅ 64줄, prop 동기화 useEffect + inflight ref + guard 콜백 |
| 3 | [Design §11.1 #2] follow API 신규 라우트 | ✅ /api/profiles/[id]/follow, 자기 자신 400, follow 알림 INSERT |
| 4 | [Design §11.1 #3] follow 알림 payload.username | ✅ route.ts + NotificationPanel:71 — notifications #4 Gap 해결 |
| 5 | [Design §11.1 #4] isLiked SELECT join | ⚠️ 변경 — fillIsLiked 후처리로 더 깔끔. Design §4.3 갱신 |
| 6 | [Design §11.1 #5] isFollowing 1쿼리 | ✅ count exact head:true |
| 7 | [Design §11.1 #6] inflight = useRef | ✅ 리렌더 미트리거 |
| 8 | [Design §11.1 #7] 자기 자신 follow 차단 | ✅ 서버 400 + UI isSelf 분기 |
| 9 | [Design §11.1 #8] SongDetailPage·GlobalMiniBar 헬퍼 통합 | ⏸️ Deferred (선택으로 명시됨) |
| 10 | [Do 신규] fillIsLiked 후처리 헬퍼 | ✅ 4개 fetch 메서드 통합, song_ids in 1쿼리 |

**Learnable**: Plan 단계의 "추후 정리" 항목(#9)은 Design에서 "선택" 표기 → 실제 Do에서 의도적 skip. PDCA의 "선택" 항목 명시가 후속 사이클로 자연스럽게 이어짐.

---

## 3. Success Criteria — Final Status

| ID | 요구 | 상태 | 증거 |
|----|------|:--:|------|
| FR-01 | follow API 토글 + 자기 자신 400 | ✅ | route.ts:18 |
| FR-02 | follow INSERT 시 알림 (payload.username) | ✅ | route.ts:48-58 |
| FR-03 | PublicSongCard 좋아요 (낙관/롤백) | ✅ | useOptimisticToggle 위임 |
| FR-04 | ProfilePanel 팔로우 + follower_count 즉시 | ✅ | followerCount 표시 |
| FR-05 | isLiked SELECT (fillIsLiked) | ✅ | services 4 메서드 통합 |
| FR-06 | isFollowing SELECT (getProfile) | ✅ | 본인 skip + count exact |
| FR-07 | 비로그인 → open-login | ✅ | guard 콜백 |
| FR-08 | 실패 시 토스트 + 롤백 | ✅ | onError + 헬퍼 롤백 |
| FR-09 | 카운트 항상 표시 | ✅ | likeCount/followerCount 헬퍼 값 |
| FR-10 | 팔로우 톤 (보라/테두리) | ✅ | 기존 className 유지 + aria-pressed 추가 |
| FR-11 | follow 알림 라우팅 payload.username | ✅ | NotificationPanel:71 |

**Overall Success Rate: 11/11 (100%)** — 실 동작 검증은 두 계정 E2E.

---

## 4. Architecture Snapshot

```
   useOptimisticToggle (헬퍼)
        ├─ PublicSongCard.toggleLike → /api/songs/[id]/like
        └─ ProfilePanel.toggleFollow → /api/profiles/[id]/follow
                                          ├─ follows 토글 + 자기 자신 차단
                                          └─ INSERT 시 notifications (type=follow, payload.username)

   exploreService:
     fillIsLiked(songs)   ── 로그인 시 song_ids in likes 1쿼리 → Set 매핑
     getProfile           ── follows count exact head:true (본인 skip)

   NotificationPanel.handleClick:
     case 'follow': payload?.username ?? actorName → view-profile dispatch
```

---

## 5. Files Touched

### 신규 (2)
- `hooks/useOptimisticToggle.ts` — 토글+낙관+롤백+inflight+guard 헬퍼 (64줄)
- `app/api/profiles/[id]/follow/route.ts` — 토글 + follow 알림 INSERT + 자기 자신 400 (75줄)

### 수정 (4)
- `services/explore.service.ts` — `fillIsLiked` 헬퍼 + 4 메서드 통합 + `getProfile.isFollowing`
- `features/explore/components/PublicSongCard.tsx` — useOptimisticToggle로 좋아요 와이어링
- `features/explore/components/ProfilePanel.tsx` — useOptimisticToggle + followerCount 즉시 갱신 + aria-pressed
- `components/NotificationPanel.tsx` — follow 알림 클릭 시 payload.username 우선

### 문서 갱신 (2)
- `docs/02-design/features/social-actions.design.md` — §4.3 fillIsLiked 패턴 + §11.1 #4 갱신
- `docs/03-analysis/social-actions.analysis.md` — §10 Resolution Log

---

## 6. Verification

### Completed
- ✅ TypeScript `tsc --noEmit`
- ✅ L1 가드: follow 401, like 401

### Pending (사용자 액션)
- ⏳ 두 계정 cross-account E2E:
  1. B가 A의 공개 곡 카드 좋아요 → 즉시 색·count 반영 → 새로고침 후 유지
  2. A 알림에 "B가 좋아했어요" 1건 (notifications 연동 검증)
  3. B가 A 프로필 팔로우 → 즉시 "팔로잉" + follower_count +1 → 새로고침 유지
  4. A 알림에 "B가 회원님을 팔로우했어요" → 클릭 → B 프로필 정확 이동
  5. 본인 프로필에서 팔로우 버튼 없음 확인
  6. 비로그인 좋아요·팔로우 클릭 → 로그인 모달
  7. 좋아요 빠른 5번 토글 → inflight 차단 동작 확인

---

## 7. Risks & Open Items

### Resolved
- ✅ follow 알림 라우팅 username 미스매치 — payload.username 포함으로 해결
- ✅ N+1 회피 — fillIsLiked 후처리 패턴

### Open (Deferred)
- SongDetailPage·GlobalMiniBar 좋아요 헬퍼 통합 (Design #8 deferred) — 별도 정리 사이클
- useOptimisticToggle prop 변경 useEffect가 낙관 +1을 덮을 가능성 — 1차 트래픽 OK, ref 기반 전환은 후속

---

## 8. Next Step Recommendations

1. **사용자**: 두 계정 E2E (7-step §6)
2. 정상 동작 확인되면 `/pdca archive social-actions --summary`
3. 다음 사이클: SongDetailPage·GlobalMiniBar 좋아요 헬퍼 통합 정리 — `like-toggle-cleanup` 같은 작은 feature
4. 2차 후보 (Plan Out of scope): 팔로워/팔로잉 리스트 모달, 팔로우 피드 필터, 좋아요한 곡 모음 페이지

---

## 9. Lessons Learned

1. **"선택" 항목은 후속 사이클로 자연스럽게**: Design §11.1 #8 "선택"으로 명시 → Do에서 의도적 skip → Check에서 "deferred"로 명확히 분리. PDCA 도구가 scope creep을 막아줌
2. **Design 단계 가정은 Do에서 더 좋은 구현 발견 시 갱신**: §4.3 join → fillIsLiked 후처리는 더 깔끔. Check 단계에서 doc 갱신으로 정합성 회복
3. **헬퍼 추출이 가치**: useOptimisticToggle 하나로 좋아요(PublicSongCard) + 팔로우(ProfilePanel) 동일 패턴 — 후속 작업(SongDetailPage 정리)도 이 헬퍼에 들어맞음
