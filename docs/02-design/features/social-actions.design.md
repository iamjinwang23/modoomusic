---
template: design
version: 1.3
feature: social-actions
selected: Option C — Pragmatic
---

# social-actions Design Document

> **Summary**: useOptimisticToggle 헬퍼로 좋아요·팔로우 토글 통일 + follow API 신규 + isLiked/isFollowing SELECT 채우기
>
> **Project**: minimax-test (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-05-26
> **Status**: Draft
> **Planning Doc**: [social-actions.plan.md](../../01-plan/features/social-actions.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 좋아요·팔로우 UI fake → 사용자 간 실제 상호작용 불가능 + follow 알림 발화 X |
| **WHO** | MONO 로그인 사용자 + 운영자 |
| **RISK** | 낙관적 UI 롤백 누락 / 자기 자신 팔로우 / 빠른 토글 race / N+1 쿼리 / follow 알림 라우팅 username 미스매치 |
| **SUCCESS** | 토글 200ms 내 UI 반영, follower_count +1 즉시, follow 알림 1초 내 적재 |
| **SCOPE** | Phase 1: 좋아요·팔로우 full stack / Out: 팔로워 리스트·피드 필터·차단 |

---

## 1. Overview

### 1.1 Design Goals

- 낙관적 UI·롤백·inflight 처리를 한 헬퍼로 통일 (현재 SongDetailPage·GlobalMiniBar에 흩어진 try/catch 코드도 정리 가능)
- 알림 시스템(이전 사이클) 패턴 그대로 재사용 — API 핸들러 INSERT, service role
- N+1 회피: SONG_SELECT에 `likes!left(user_id)` join 단일 쿼리
- follow 알림 클릭 라우팅 정확도: payload에 `username` 포함

### 1.2 Design Principles

- DB·RLS는 진실의 원천 (이미 001 migration에 있음 — 새 마이그레이션 불필요)
- 서버 응답 = 진실 (낙관적 UI 후 응답으로 강제 동기화 가능)
- 비로그인 시 `open-login` 이벤트 (기존 패턴)
- 빠른 토글: inflight flag로 중복 클릭 무시

---

## 2. Architecture (Option C — Pragmatic)

### 2.0 Architecture Comparison (선택 결과)

| Criteria | A: Minimal | B: Clean | **C: Pragmatic ✓** |
|----------|:-:|:-:|:-:|
| 신규 파일 | 1 | 5 | **2** |
| 수정 파일 | 3 | 4 | **3** |
| 복잡도 | Low | High | **Low-Medium** |
| 추가 추상화 | 없음 | Context+hooks | **헬퍼 1개** |
| 코드 중복 | 컴포넌트마다 try/catch 반복 | 없음 | **헬퍼로 통일** |

**Rationale**: 좋아요·팔로우는 본질적으로 같은 패턴(토글+낙관+롤백+inflight). 헬퍼 1개로 표준화하면 SongDetailPage·GlobalMiniBar의 기존 try/catch도 정리 가능. Context 신규는 1차 트래픽에 과함.

### 2.1 Component Diagram

```
   ┌─────────────────────────────────────────────┐
   │ Supabase                                    │
   │  likes (RLS: 본인만 INSERT/DELETE)          │
   │  follows (RLS: 본인만 INSERT/DELETE)        │
   │  notifications (RLS: service role INSERT)   │
   │  + count 트리거(like_count, follower_count) │
   └────────────────┬────────────────────────────┘
                    │
   ┌────────────────▼──────────────────┐
   │ API Routes (server)               │
   │  POST /api/songs/[id]/like (기존)  │
   │  POST /api/profiles/[id]/follow   │  ← 신규
   │   ├─ 인증 (createUserClient)       │
   │   ├─ 자기 자신 차단 (400)          │
   │   ├─ follows 토글 (createClient)   │
   │   └─ INSERT 시 follow 알림         │
   │       payload: { username }       │
   └────────────────┬──────────────────┘
                    │ { liked|following, count }
                    │
   ┌────────────────▼──────────────────┐
   │ useOptimisticToggle (헬퍼)        │  ← 신규
   │  - state (boolean)                │
   │  - count (number)                 │
   │  - pending (inflight flag)        │
   │  - toggle() = 낙관 + fetch + 롤백 │
   └────────────────┬──────────────────┘
                    │
   ┌────────────────▼──────────────────┐
   │ UI                                 │
   │  PublicSongCard.handleLike (수정)  │
   │  ProfilePanel.팔로우 버튼 (수정)    │
   │  SongDetailPage/GlobalMiniBar      │
   │   (기존 try/catch도 헬퍼로 교체)    │
   └───────────────────────────────────┘

   exploreService:
    SONG_SELECT에 likes!left join + isLiked 매핑
    getProfile에 follows 1쿼리 → isFollowing
```

---

## 3. Data Model

DB 변경 없음. 기존 `001_initial_schema.sql`의 `likes`·`follows`·count 트리거 그대로 사용.

### 3.1 알림 `follow` 타입 payload 명세

```ts
// notifications 테이블의 payload jsonb
{
  username: string  // actor의 username (라우팅용)
}
```

NotificationPanel.handleClick의 follow 분기에서 `notif.payload.username || notif.actorName`로 fallback.

---

## 4. API Spec

### 4.1 `POST /api/profiles/[id]/follow` (신규)

**Request**
```http
POST /api/profiles/{targetUserId}/follow
Cookie: <session>
```

**Response 200**
```json
{ "following": true, "followerCount": 42 }
```

**Logic**
1. Auth: session 없으면 401
2. `targetUserId === me`이면 400 (자기 자신)
3. `follows` 조회 `(follower_id=me, following_id=target)`
4. 존재하면 DELETE → `following = false`
5. 없으면 INSERT → `following = true` + 알림 INSERT
   ```ts
   await admin.from('notifications').insert({
     user_id: targetUserId,
     type: 'follow',
     actor_id: me,
     payload: { username: actor.username },
   })
   ```
6. `profiles.follower_count` 재조회 (트리거 갱신 완료 후) → 응답

**Errors**: 400 (자기 자신) / 401 (인증) / 404 (target 프로필 없음) / 500

### 4.2 `POST /api/songs/[id]/like` (기존, 변경 없음)

- 이전 notifications 사이클에서 구축됨
- like 알림 INSERT 로직 그대로

### 4.3 클라이언트 SELECT (services/explore.service.ts)

**isLiked 채우기** (Do 단계 갱신 — 후처리 헬퍼로 결정):

SONG_SELECT는 그대로 두고 `fillIsLiked(supabase, songs)` 헬퍼로 후처리. song_ids로 `likes` 테이블에 `.in('song_id', songIds)` 단일 쿼리 → Set 매핑. SONG_SELECT join 방식보다 N+1 회피 더 명확하고 SONG_SELECT 깔끔 유지.

```ts
async function fillIsLiked(supabase, songs) {
  if (songs.length === 0) return songs
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return songs  // 비로그인은 false 유지
  const { data: myLikes } = await supabase
    .from('likes')
    .select('song_id')
    .eq('user_id', user.id)
    .in('song_id', songs.map(s => s.id))
  const likedSet = new Set((myLikes ?? []).map(l => l.song_id))
  return songs.map(s => ({ ...s, isLiked: likedSet.has(s.id) }))
}
```

`getFeed`, `getByFilter`, `getUserSongs`, `getPublicSongById` 4개 메서드에서 호출.

**isFollowing 채우기** (`getProfile`):
```ts
const myId = ...
const [profile, isFollowing] = await Promise.all([
  supabase.from('profiles').select(...).eq('username', username).maybeSingle(),
  myId ? supabase.from('follows')
    .select('follower_id', { head: true, count: 'exact' })
    .eq('follower_id', myId).eq('following_id', profile.id)
    .then(({ count }) => (count ?? 0) > 0) : Promise.resolve(false)
])
```

---

## 5. UI Design

### 5.1 `useOptimisticToggle` 헬퍼

```ts
// hooks/useOptimisticToggle.ts
interface ToggleApi<T> {
  state: boolean
  count: number
  pending: boolean
  toggle: () => Promise<void>
}

export function useOptimisticToggle({
  initialState,
  initialCount,
  fetcher,           // () => Promise<{ state: boolean, count?: number }>
  onUnauthenticated, // () => void  — 비로그인 처리
  onError,           // (e: Error) => void  — 토스트
}): ToggleApi {
  const [state, setState] = useState(initialState)
  const [count, setCount] = useState(initialCount)
  const pending = useRef(false)

  const toggle = useCallback(async () => {
    if (pending.current) return  // inflight 중복 차단
    if (typeof onUnauthenticated === 'function' && !(/* 로그인 체크 */)) {
      onUnauthenticated()
      return
    }
    pending.current = true
    const prev = { state, count }
    const next = !state
    setState(next)
    setCount(c => c + (next ? 1 : -1))
    try {
      const res = await fetcher()
      setState(res.state)
      if (typeof res.count === 'number') setCount(res.count)
    } catch (e) {
      setState(prev.state)
      setCount(prev.count)
      onError?.(e as Error)
    } finally {
      pending.current = false
    }
  }, [state, count])

  return { state, count, pending: pending.current, toggle }
}
```

비로그인 체크는 `useAuth().user`로 호출 측에서 처리 (헬퍼는 콜백만 호출).

### 5.2 PublicSongCard 좋아요 변경

```tsx
const { user } = useAuth()
const { state: liked, count: likeCount, toggle } = useOptimisticToggle({
  initialState: song.isLiked ?? false,
  initialCount: song.likeCount,
  fetcher: async () => {
    const r = await fetch(`/api/songs/${song.id}/like`, { method: 'POST' })
    if (!r.ok) throw new Error('like failed')
    const d = await r.json()
    return { state: d.liked, count: d.likeCount }
  },
  onUnauthenticated: !user ? () => window.dispatchEvent(new Event('open-login')) : undefined,
  onError: () => toast.error('좋아요 처리에 실패했어요'),
})
```

### 5.3 ProfilePanel 팔로우 변경

```tsx
const { state: following, count: followerCount, toggle } = useOptimisticToggle({
  initialState: profile.isFollowing ?? false,
  initialCount: profile.followerCount,
  fetcher: async () => {
    const r = await fetch(`/api/profiles/${profile.userId}/follow`, { method: 'POST' })
    if (!r.ok) {
      if (r.status === 401) window.dispatchEvent(new Event('open-login'))
      throw new Error('follow failed')
    }
    const d = await r.json()
    return { state: d.following, count: d.followerCount }
  },
  onUnauthenticated: !user ? () => window.dispatchEvent(new Event('open-login')) : undefined,
  onError: () => toast.error('팔로우에 실패했어요'),
})

// follower_count 표시도 followerCount 로컬 state 사용 (즉시 +1/-1)
```

본인 프로필(`isSelf`)에서는 팔로우 버튼 자체 미렌더 (기존 분기 유지).

### 5.4 SongDetailPage·GlobalMiniBar 좋아요도 헬퍼로 정리 (선택)

이번 사이클의 부수 효과로 기존 try/catch를 헬퍼로 교체하면 코드 일관성. 필수 아님 (기존 동작 정상이므로 deferred 가능).

→ **결정**: 이번에 같이 정리 (3개 컴포넌트 패턴 통일이 본 사이클의 가치 절반)

### 5.5 follow 알림 클릭 라우팅

NotificationPanel.handleClick 수정:
```ts
} else if (n.type === 'follow') {
  const username = (n.payload as { username?: string })?.username ?? n.actorName
  if (username) window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))
}
```

---

## 6. State & Events

### 6.1 이벤트 버스

신규 없음. 기존 이벤트 재사용:
- `open-login` — 비로그인 시
- `notifications-changed` — follow API 응답 후 발화 (수신자 unread 갱신)
- `view-profile` — follow 알림 클릭 시

### 6.2 카운트 일관성

- DB 트리거가 `like_count`/`follower_count`/`following_count` 자동 갱신
- 클라이언트 낙관적 +1/-1 → 서버 응답으로 강제 동기화
- 새로고침 시 DB 진실로 회귀

---

## 7. UI Component Map

| 파일 | 종류 | 역할 |
|------|------|------|
| `hooks/useOptimisticToggle.ts` | 신규 | 토글+낙관+롤백+inflight 헬퍼 |
| `app/api/profiles/[id]/follow/route.ts` | 신규 | 팔로우 토글 + follow 알림 INSERT |
| `services/explore.service.ts` | 수정 | SONG_SELECT에 likes!left join + isLiked 매핑 / getProfile에 isFollowing 1쿼리 추가 |
| `features/explore/components/PublicSongCard.tsx` | 수정 | handleLike → useOptimisticToggle |
| `features/explore/components/ProfilePanel.tsx` | 수정 | 팔로우 버튼 → useOptimisticToggle, followerCount 즉시 갱신 |
| `components/NotificationPanel.tsx` | 수정 | follow 알림 클릭 시 payload.username 우선 |
| `components/SongDetailPage.tsx` | 수정 (선택) | 좋아요도 useOptimisticToggle로 정리 |
| `components/GlobalMiniBar.tsx` | 수정 (선택) | 동일 |

---

## 8. Test Plan

### 8.1 L1 — API

```
# 비로그인 follow → 401
curl -X POST /api/profiles/<other>/follow
→ 401

# 자기 자신 follow → 400
curl -X POST /api/profiles/<me>/follow -b session=<me>
→ 400

# 정상 follow → 200, follow 알림 1건
curl -X POST /api/profiles/<other>/follow -b session=<me>
→ 200 { following: true, followerCount: ↑ }
→ notifications에 type=follow, user_id=other, actor_id=me, payload.username=me_username

# 토글 unfollow
(같은 요청 다시) → 200 { following: false, followerCount: ↓ }
```

### 8.2 L2 — UI (Optimistic)

1. PublicSongCard 좋아요 클릭 → 즉시 색·count 변경 → 새로고침 후 유지
2. 좋아요 빠른 5번 토글 → 마지막 의도와 서버 상태 일치 (inflight 차단으로 1번씩 처리)
3. 다른 사용자 프로필 팔로우 → 즉시 "팔로잉" + follower_count +1 → 새로고침 후 유지
4. 본인 프로필에서 팔로우 버튼 미노출
5. 비로그인에서 좋아요·팔로우 클릭 → 로그인 모달
6. 서버 500 강제 → UI 롤백 + 토스트

### 8.3 L3 — E2E

- A 계정에서 B 팔로우 → B 알림 패널에 "회원님을 팔로우했어요" → 클릭 → A 프로필로 이동 (username 정확)

---

## 9. Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| isLiked SELECT N+1 — 곡당 likes 모두 join | 1차 트래픽 OK. 곡당 좋아요 1000+ 도달 시 별도 IN 쿼리로 전환 |
| follower_count 트리거와 클라이언트 낙관적 +1 race | 서버 응답에서 fresh followerCount 받아 강제 동기화 |
| follow API 401 시 헬퍼가 일반 error로 처리 → 로그인 모달 안 뜸 | fetcher에서 401 감지 시 open-login 명시 dispatch (5.3 참고) |
| useOptimisticToggle이 song 데이터 prop 변경 시 initial 미반영 | useEffect로 prop 변경 시 state/count 동기화 |
| follow 알림 actorName이 displayName이고 username 다른 경우 라우팅 깨짐 | payload.username 우선 사용 (5.5) |

---

## 10. Non-Functional

- **Performance**: 낙관적 UI 0ms, API < 300ms 목표
- **Security**: RLS는 본인 명의만 INSERT (이미 001에 있음). follow API에서 인증 + 자기 자신 차단
- **A11y**: 좋아요·팔로우 버튼 aria-pressed
- **다크 톤**: 기존 토큰 재사용 (보라 violet-500/600, 화이트, 빨강 red-500)

---

## 11. Implementation Guide

### 11.1 Decision Record

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | useOptimisticToggle 헬퍼 1개 도입 | 4개 컴포넌트(PublicSongCard·ProfilePanel·SongDetailPage·GlobalMiniBar)에서 같은 패턴 반복 → 중복 제거 |
| 2 | follow API 신규 라우트 (`/api/profiles/[id]/follow`) | RESTful + 알림 INSERT 같이 처리 (notifications와 일관) |
| 3 | follow 알림 payload에 username 포함 | NotificationPanel 라우팅 정확도 (Gap 회피) |
| 4 | isLiked는 fillIsLiked 후처리(in 쿼리) — Do 단계 갱신 | join 대신 후처리: SONG_SELECT 깔끔 유지 + N+1 회피 더 명확 |
| 5 | isFollowing은 getProfile에서 1쿼리 | 프로필 페이지당 1회만 호출, 부담 X |
| 6 | inflight flag = useRef (state X) | 리렌더 트리거 안 함 |
| 7 | 자기 자신 follow는 서버 400 + UI에서 isSelf 분기로 버튼 미노출 (이중 안전) | 안전 |
| 8 | SongDetailPage·GlobalMiniBar 좋아요도 헬퍼로 정리 | 부수 효과 — 코드 일관성. 필수 아니나 본 사이클에 포함 |

### 11.2 Implementation Order

1. **헬퍼**: `hooks/useOptimisticToggle.ts`
2. **API**: `app/api/profiles/[id]/follow/route.ts`
3. **Service**: `services/explore.service.ts` SONG_SELECT + isLiked 매핑 + isFollowing
4. **UI 통합**: PublicSongCard → useOptimisticToggle (좋아요)
5. **UI 통합**: ProfilePanel → useOptimisticToggle (팔로우, followerCount 즉시)
6. **UI 정리**: SongDetailPage / GlobalMiniBar 좋아요도 헬퍼로 교체
7. **알림 라우팅**: NotificationPanel follow payload.username
8. **테스트**: L1 curl + 수동 두 계정 E2E

### 11.3 Session Guide

~400~500줄 예상. 한 세션 가능.

| Module | 범위 |
|--------|------|
| `module-helper` | 1 (useOptimisticToggle) |
| `module-api` | 2 (follow route) |
| `module-service` | 3 (SELECT 채우기) |
| `module-ui` | 4~7 (모든 컴포넌트 와이어링 + NotificationPanel 라우팅) |

---

## 12. Open Questions

- 본인 프로필에서 follower_count/following_count 클릭 시 리스트 모달 → Out of scope
- follow 알림이 묶음(3명 팔로우)으로 와야 하는가 → Out of scope (1차 단건)
