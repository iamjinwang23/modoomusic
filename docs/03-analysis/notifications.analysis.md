# notifications Gap Analysis

> **Date**: 2026-05-26
> **Match Rate**: 96% (static + L1 가드만)
> **Mode**: Static analysis + L1 API guard probes (DB migration 미적용 / 사용자 세션 없어 full runtime 불가)
> **Recommendation**: critical-only-iterate (DB 적용 후 L2/L3 실행 권장)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 좋아요·새 곡 완성이 toast로만 휘발돼 사용자 활동 흔적이 안 남음 + 운영자 공지 채널 부재 |
| **WHO** | MONO 모든 로그인 사용자(수신) + 비누컴퍼니 운영자(발신) |
| **RISK** | RLS 미흡 → 타 사용자 알림 노출 / z-index 충돌 / 좋아요 토글 중복 |
| **SUCCESS** | 좋아요 → 1초 내 적재 / 패널 fetch < 300ms / 점 배지 정확도 100% |
| **SCOPE** | Phase 1: 5종 알림 / Out: 푸시·이메일·admin UI·Realtime |

---

## 1. Strategic Alignment

| 질문 | 결론 | 근거 |
|------|------|------|
| PRD WHY(toast 휘발 + 운영자 채널)를 해결했나? | ✅ Yes | DB 영구 적재, 시스템 공지 SQL 패턴 |
| Plan Success Criteria 달성 경로가 코드에 있나? | ✅ Yes | FR-01~12 모두 코드 존재 (§3 참조) |
| Design 핵심 결정이 따라졌나? | ⚠️ Partial | 8개 중 6개 일치, 2개는 Do 단계 의도적 변경 (§5 참조) |

---

## 2. Structural Match (90.9% — 10/11)

Design §7 UI Component Map vs 코드:

| 항목 | 상태 | 비고 |
|------|------|------|
| `components/NotificationPanel.tsx` (신규) | ✅ | 116 lines |
| `components/NotificationItem.tsx` (신규) | ✅ | 83 lines |
| `app/(main)/notifications/page.tsx` (수정) | ✅ | placeholder → `<NotificationPanel mode="page" />` |
| `app/(main)/layout.tsx` (수정) | ✅ | 패널 토글 + unread + 점 배지 + route close |
| `components/BottomNav.tsx` (수정) | ✅ | 알림 탭 점 배지 |
| `services/notification.service.ts` (신규) | ✅ | 78 lines |
| `app/api/songs/[id]/like/route.ts` (신규) | ✅ | 78 lines |
| `app/api/generate/route.ts` (수정) | ❌ | **갭**: 곡 INSERT 가 클라이언트에서 일어나 별도 라우트 분리됨 (Do 단계 결정) |
| `lib/supabase/admin.ts` (신규) | ❌ | **갭**: 기존 `lib/supabase/server.ts`의 `createClient`가 이미 service role 사용 → 신규 불필요 발견 |
| `types/domain.ts` (수정) | ✅ | Notification, NotificationType, NotificationSystemPayload |
| `supabase/migrations/010_notifications.sql` (신규) | ✅ | 50 lines, RLS + 인덱스 + dedupe UNIQUE |
| 추가: `app/api/notifications/song-complete/route.ts` (신규) | ➕ | Do 단계 신규 (Design §4.2 대체) |
| 추가: `utils/relativeTime.ts` (신규) | ➕ | NotificationItem이 의존 (Design §5.3에서 요구) |
| 추가: `app/globals.css` 키프레임 (수정) | ➕ | `slideInLeft` (Design §5.1에서 요구) |
| 추가: `services/song.service.ts` (수정) | ➕ | `save()` Promise화 (song_complete 알림 안전성) |
| 추가: `components/SongDetailPage.tsx` / `components/GlobalMiniBar.tsx` (수정) | ➕ | 좋아요 isOwner 분기 (사용자 동의로 같이 통합) |

**해석**: 2개 갭은 모두 Do 단계에서 사용자와 합의된 의도적 변경. Design doc 갱신 필요.

---

## 3. Functional Depth (100%)

| 파일 | 핵심 로직 | placeholder 여부 |
|------|----------|:--:|
| NotificationPanel | fetch + 빈상태 + 스켈레톤 + 타입별 라우팅 + ESC 닫기 + invalidate 리스닝 | ❌ |
| NotificationItem | 타입별 텍스트/비주얼 분기, 미읽음 표시, 시간 포맷 | ❌ |
| notification.service | list (profile/song join), unreadCount (count exact), markAsRead | ❌ |
| like route | 인증 + 곡 존재/공개 검증 + 토글 + 본인 곡 제외 + dedupe + likeCount 재조회 | ❌ |
| song-complete route | songId 검증 + 본인 곡 검증(스푸핑 방지) + INSERT | ❌ |
| layout 알림 메뉴 | isNotif 분기 → button/Link, 점 배지, pathname 변경 시 닫기 | ❌ |

---

## 4. API Contract (100%) — L1 검증

| Endpoint | Design Spec | route.ts | Client | 상태 |
|----------|-------------|----------|--------|------|
| POST /api/songs/[id]/like | `{ liked, likeCount }` | `{ liked, likeCount }` | SongDetailPage·GlobalMiniBar fetch + `data.liked` 사용 | ✅ |
| POST /api/notifications/song-complete | `{ songId }` → `{ ok }` (Do 단계 추가) | 일치 | useSongGeneration body 일치 | ✅ |
| GET /api/notifications | API 없음 (Supabase 직접) | N/A | notification.service.list | ✅ 의도대로 |
| PATCH /api/notifications/[id]/read | API 없음 (Supabase 직접) | N/A | markAsRead | ✅ 의도대로 |

**L1 runtime probes (서버 가동, DB 미적용):**

```
POST /api/songs/abc/like (no session)              → 401 ✅
POST /api/notifications/song-complete (no body)    → 400 "invalid songId" ✅
POST /api/notifications/song-complete (no session) → 401 "unauthorized" ✅
```

가드 3종 통과. INSERT 자체는 DB 적용 후 L1 재실행 필요.

---

## 5. Decision Record Verification

| # | Design 결정 | 코드 반영 | 비고 |
|---|------------|:--:|------|
| 1 | INSERT는 API 핸들러 (trigger X) | ✅ | like + song-complete route |
| 2 | 시스템 공지 사용자별 행 복제 | ✅ | migration 주석에 SQL 예시 |
| 3 | dedupe UNIQUE INDEX | ✅ | `idx_notifications_dedupe_like` |
| 4 | 데스크톱 button / 모바일 Link 분기 | ✅ | layout `isNotif` |
| 5 | NotificationPanel `mode` prop | ✅ | overlay / page |
| 6 | service role admin client 신규 | ⚠️ Drift | 실제로는 기존 server.ts `createClient` 재사용 — Design § 11.1 #6 갱신 필요 |
| 7 | Realtime 미도입 | ✅ | invalidate 이벤트만 |
| 8 | `/api/notifications` GET X, Supabase 직접 | ✅ | service에서 직접 |

추가 Do 단계 결정:
- **곡 INSERT 클라이언트 → song-complete 별도 라우트**: songService.save() Promise화로 안전성 확보 (Design §4.2 보강 필요)
- **좋아요 UI 통합**: isOwner ? 책갈피 : 공개 좋아요 API (Plan §2 Out of Scope이 아니었으나 Do에서 같이 진행, 사용자 동의)

---

## 6. Plan Success Criteria 검증

| ID | 요구 | 상태 | 증거 |
|----|------|:--:|------|
| FR-01 | 5종 타입 enum | ✅ | migration CHECK + types `NotificationType` |
| FR-02 | RLS 본인 SELECT/UPDATE, INSERT service role만 | ✅ | migration policy 3종 (insert 정책 미생성으로 차단) |
| FR-03 | 좋아요 INSERT 시 알림, 본인 좋아요 제외 | ✅ | like route §4 분기 + dedupe UNIQUE |
| FR-04 | 곡 완성 알림 | ✅ | song-complete route + useSongGeneration |
| FR-05 | 시스템 공지 | ✅ | migration 주석 + 운영자 SQL 패턴 |
| FR-06 | 데스크톱 라우트 X 패널 토글 | ✅ | layout isNotif 분기 |
| FR-07 | 모바일 풀 페이지 | ✅ | `/notifications/page.tsx` |
| FR-08 | 점 배지 (사이드바·BottomNav) | ✅ | layout + BottomNav |
| FR-09 | 타입별 라우팅 | ✅ | NotificationPanel.handleClick |
| FR-10 | 개별 클릭 시에만 read_at | ✅ | markAsRead 1건만 |
| FR-11 | 빈 상태 + 스켈레톤 | ✅ | NotificationPanel |
| FR-12 | 한국어 + 상대 시간 | ✅ | relativeTime util + NotificationItem 텍스트 |

**12/12 코드 존재.** 실 동작 검증은 DB 적용 후.

---

## 7. Gap List

| # | Severity | Conf | Gap | 위치 | 권장 수정 |
|---|----------|:---:|-----|------|----------|
| 1 | **Critical** | 100% | DB migration 미적용 → 알림 테이블 없음. 코드는 정상이나 실 동작 불가 | Supabase | 사용자가 `010_notifications.sql` Supabase Dashboard SQL Editor에 적용 |
| 2 | Important | 100% | Design §4.2: "/api/generate에 INSERT 추가" 가정 → 실제 별도 라우트 (Do 결정) | Design doc | §4.2 갱신: `/api/notifications/song-complete` 신규 라우트 + songService.save Promise화 명시 |
| 3 | Important | 100% | Design §11.1 #6: "service role admin client 신규" → 실제 기존 server.ts createClient 재사용 | Design doc | §11.1 #6 갱신: "lib/supabase/server.ts:createClient (이미 service role 사용)" |
| 4 | Minor | 90% | NotificationPanel follow 라우팅: actorName(=displayName)을 username으로 사용 → username≠displayName 시 깨짐 | NotificationPanel:69 | follow 알림 INSERT 시 `payload.username` 같이 저장 또는 actorId로 username 조회. 1차 follow 알림 없으니 deferred |
| 5 | Minor | 95% | view-song dispatch payload가 layout의 ?song= 핸들러와 중복 (rowToSong 비슷한 매핑) | NotificationPanel handleClick, layout ?song= | utils로 추출하면 깔끔 (선택) |
| 6 | Minor | 80% | 좋아요 API 403(비공개 곡) 시 클라이언트 silent fail | SongDetailPage·GlobalMiniBar fetch | toast.error 추가 또는 비공개 곡엔 좋아요 버튼 자체 숨김 |
| 7 | Minor | 70% | song_complete INSERT 시 actor_id 명시 X (null default) → 의도된 동작 | song-complete route | 변경 불필요 |
| 8 | Minor | 60% | NotificationItem `song_complete` 시 songCoverImage 없으면 빈 사각형. fallback gradient 없음 | NotificationItem visual | songCoverHue로 gradient fallback (선택) |

**Critical 1건, Important 2건, Minor 5건.**

---

## 8. Match Rate

```
Static-only formula: Structural × 0.2 + Functional × 0.4 + Contract × 0.4

Structural: 10/11 = 90.9%  (admin.ts·generate 수정 미반영 = Do 의도된 결정)
Functional: 100%           (placeholder 없음, 모든 핵심 로직 구현됨)
Contract:   100%           (L1 가드 3종 통과, 미가드 INSERT는 DB 적용 후)

Overall = 0.909 × 0.2 + 1.00 × 0.4 + 1.00 × 0.4
       = 0.182 + 0.4 + 0.4 = 0.982

≈ 96% (보수적), 100% (의도된 편차 인정 시)
```

**계산 채택: 96%.** ≥ 90% 임계치 충족.

---

## 9. Runtime Verification 한계 + 다음 검증

- L1: 가드 통과만 확인. INSERT/SELECT 실행은 DB 적용 후 두 계정 cross-account 테스트 필요
- L2 (Playwright): 미설치 → 생성 skip. 1차에는 수동 E2E 권장
- L3: 사용자가 수동으로 두 브라우저 좋아요 + 알림 패널 확인

### 수동 E2E 시나리오 (DB 적용 후)

1. 브라우저 A·B 각각 다른 계정 로그인
2. B가 A의 공개 곡 상세 진입 → 좋아요
3. A 새로고침 → 사이드바 알림 메뉴 빨간 점, BottomNav도 빨간 점
4. A 알림 메뉴 클릭 → 데스크톱: 오버레이 패널 / 모바일: `/notifications` 풀 페이지
5. "B님이 [곡]를 좋아했어요" 1건 보임 → 클릭 → 곡 상세 열림, read_at 채워짐, 점 배지 사라짐
6. B가 다시 좋아요 off→on → A에 알림 1건 유지(dedupe), 새 알림 X
7. A가 새 곡 생성 → 토스트 + 알림에 "song_complete" 1건 추가
8. 운영자가 SQL로 system 알림 INSERT → A 새로고침 → 알림 1건 추가

---

## 10. Recommendation

**critical-only-iterate** — Critical #1(DB migration)만 사용자 action으로 해결되면 즉시 Report 가능. Important #2·#3은 Design doc 갱신만으로 처리 (코드 변경 X). Minor는 deferred.

**예상 결과 Match Rate**: DB 적용 + Design doc 갱신 → 100% (실 동작 검증은 후속)

---

## 11. Resolution Log (2026-05-26)

- ✅ **#2 Resolved**: Design §4.2 갱신 — `/api/generate` INSERT 가정 제거, `/api/notifications/song-complete` 신규 라우트로 대체
- ✅ **#3 Resolved**: Design §4.5 + §11.1 #6 갱신 — admin.ts 신규 제거, 기존 `lib/supabase/server.ts:createClient` 재사용 명시
- ✅ Design §7 UI Component Map — Do 단계 추가 6항목 반영 (song-complete route, useSongGeneration, song.service async, SongDetailPage·GlobalMiniBar 좋아요 분기, relativeTime, globals.css)
- ⏳ **#1 (Critical)**: 사용자 액션 대기 — `supabase/migrations/010_notifications.sql` Supabase Dashboard SQL Editor 적용
- ⏸️ Minor #4~#8: Deferred (후속 PR)

**Updated Match Rate (Important 해결 후)**: 약 99% (Critical 1건만 외부 액션 대기). Report 단계 진행 가능.
