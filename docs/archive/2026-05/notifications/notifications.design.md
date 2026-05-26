---
template: design
version: 1.3
feature: notifications
selected: Option C — Pragmatic
---

# notifications Design Document

> **Summary**: Supabase `notifications` 테이블 + RLS, API 핸들러 INSERT, shell layout 패널 state, NotificationPanel + NotificationItem 컴포넌트 분리
>
> **Project**: minimax-test (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-05-26
> **Status**: Draft
> **Planning Doc**: [notifications.plan.md](../../01-plan/features/notifications.plan.md)

---

## Context Anchor

> Copied from Plan document. Ensures strategic context survives Design→Do handoff.

| Key | Value |
|-----|-------|
| **WHY** | 좋아요·새 곡 완성이 toast로만 휘발돼 사용자 활동 흔적이 안 남음 + 운영자 공지 채널 부재 |
| **WHO** | MONO 모든 로그인 사용자(수신) + 비누컴퍼니 운영자(시스템 공지 발신) |
| **RISK** | RLS 미흡 시 타 사용자 알림 노출 / 좋아요 토글 중복 / 데스크톱 오버레이 z-index 충돌 |
| **SUCCESS** | 좋아요 → 1초 내 적재 / 패널 fetch < 300ms / 미읽음 점 배지 정확도 100% |
| **SCOPE** | Phase 1: 5종 알림 스키마·RLS·API INSERT·패널 UI·점 배지·읽음 처리 / Out: 푸시·이메일·admin UI·Realtime |

---

## 1. Overview

### 1.1 Design Goals

- 기존 패턴(이벤트 버스, shell layout state, profileColor)에 자연스럽게 녹임 — 새 Context·Realtime·trigger 도입 회피
- RLS로 사용자 분리 (DB 레이어에서 강제)
- 1차 5종 타입을 단일 컴포넌트 분기로 처리하되, 타입 추가 시 분기 위치가 한 곳(NotificationItem 라우팅 헬퍼)에 모이도록
- 데스크톱·모바일 UI 분리(오버레이 vs 풀페이지), 데이터 레이어는 공유

### 1.2 Design Principles

- DB가 진실의 원천 (RLS·NOT NULL·CHECK로 데이터 무결성 보장)
- 클라이언트는 캐시하지 않음 — 마운트·이벤트 발생 시 fetch
- 곡 소유자 hue 전파 패턴 재사용 (`ownerAvatarHue`)
- 한국어 친근 존댓말, 이모지 회피

---

## 2. Architecture (Option C — Pragmatic)

### 2.0 Architecture Comparison (선택 결과)

| Criteria | Option A | Option B | **Option C ✓** |
|----------|:-:|:-:|:-:|
| 신규 파일 | 3 | 9 | **4** |
| 수정 파일 | 4 | 5 | **5** |
| 복잡도 | Low | High | **Medium** |
| 유지보수성 | Medium | High | **High** |
| 노력 | Low | High | **Medium** |
| Realtime | ❌ | ✅ | ❌ (2차 후보) |
| Context Provider 신규 | ❌ | ✅ | ❌ (shell state 재사용) |
| 알림 INSERT | API 핸들러 | Postgres trigger | **API 핸들러** |

**Rationale**: 1차 알림 5종 + 트래픽 낮음 → Realtime·trigger 비용 회피. 패널 상태는 기존 이벤트 버스·shell state 패턴과 통일. 타입 추가는 NotificationItem 라우팅 헬퍼 한 곳에서.

### 2.1 Component Diagram

```
                           ┌────────────────────────────┐
                           │ Supabase notifications RLS │
                           │ (auth.uid() = user_id)     │
                           └─────────────┬──────────────┘
                                         │ SELECT/UPDATE (자신만)
                                         │ INSERT (service role only)
                                         │
   ┌──────────────────────┐              │
   │ API Routes (server)  │── INSERT ────┘
   │  /api/songs/[id]/    │              ┌──────────────────────┐
   │    like (신규)        │              │ NotificationPanel    │
   │  /api/generate       │              │ (데스크톱 오버레이)    │
   │  + system: SQL 직접   │              └──────────┬───────────┘
   └──────────────────────┘                         │ render
                                                    │
                                         ┌──────────▼──────────┐
                                         │ NotificationItem    │
                                         │ (타입 분기 + 라우팅) │
                                         └──────────┬──────────┘
                                                    │ click → mark read
                                                    │       → 이동
                                         ┌──────────▼──────────┐
                                         │ view-song /         │
                                         │ view-profile /      │
                                         │ system modal        │
                                         └─────────────────────┘

shell layout state ── notifPanelOpen ── 사이드바 알림 메뉴 클릭으로 토글
                  ── unreadCount ────── 점 배지 (배지 갱신은 이벤트 invalidate)

events: notifications-updated  ← (likeAPI / generateAPI 응답 후 클라이언트가 발화)
        notifications-invalidate ← unreadCount 재조회 트리거
```

### 2.2 Tech Stack

- Next.js 15 App Router (기존)
- Supabase (DB + RLS + Service Role for INSERT)
- Tailwind v4 (다크 토큰 재사용)
- 이벤트 버스 (window.CustomEvent)

---

## 3. Data Model

### 3.1 `notifications` 테이블

```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- 수신자
  type text NOT NULL CHECK (type IN ('like','song_complete','system','follow','comment')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,          -- 행위자 (system은 NULL)
  song_id uuid REFERENCES songs(id) ON DELETE CASCADE,                 -- like/song_complete/comment 시
  comment_id uuid,                                                     -- comment 도입 시 사용 (현재 NULL)
  payload jsonb DEFAULT '{}'::jsonb,                                   -- system body / 추가 메타
  read_at timestamptz,                                                 -- NULL = 미읽음
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 본인 알림만 조회
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 알림만 읽음 처리
CREATE POLICY "notifications_update_own_read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT: 클라이언트 절대 X, service role만 (anon 키 차단)
-- (CREATE POLICY 자체를 만들지 않음 → RLS 활성화 상태에서 INSERT 차단됨)
```

### 3.2 TypeScript 타입 (`types/domain.ts`)

```ts
export type NotificationType = 'like' | 'song_complete' | 'system' | 'follow' | 'comment'

export interface Notification {
  id: string
  type: NotificationType
  actorId: string | null
  actorName?: string | null        // join via profiles
  actorAvatarUrl?: string | null
  actorAvatarHue?: number | null
  songId: string | null
  songTitle?: string | null        // join via songs
  songCoverImage?: string | null
  songCoverHue?: number | null
  payload: Record<string, unknown> // system: { title: string, body: string, url?: string }
  readAt: string | null
  createdAt: string
}
```

### 3.3 시스템 공지 INSERT 패턴 (운영자 SQL)

```sql
-- 전 사용자에게 공지
INSERT INTO notifications (user_id, type, actor_id, payload)
SELECT id, 'system', NULL,
       '{"title":"새 기능 안내","body":"가사 자동생성이 추가됐어요","url":"/"}'::jsonb
FROM profiles;
```
1차에는 admin UI 없음 — Supabase Dashboard SQL Editor에서 직접 실행.

---

## 4. API Spec

### 4.1 `POST /api/songs/[id]/like` (신규)

곡 좋아요 토글. 현재 코드는 `song.service.update({ liked })`로 본인 곡 owner 토글만 가능 → **공개 좋아요용 신규 라우트** 필요.

**Request**
```http
POST /api/songs/{id}/like
Cookie: <session>
```

**Response 200**
```json
{ "liked": true, "likeCount": 13 }
```

**Logic**
1. Auth: session 없으면 401
2. `likes` 테이블에 `(user_id, song_id)` 존재 여부 조회
3. 없으면 INSERT + `like_count++` (RPC `increment_like_count`)
4. 있으면 DELETE + `like_count--`
5. **INSERT 한 경우만** 알림 생성: 곡 소유자 ≠ liker 일 때
   ```sql
   INSERT INTO notifications (user_id, type, actor_id, song_id)
   VALUES (<song.user_id>, 'like', <auth.uid>, <song.id>)
   ON CONFLICT DO NOTHING;  -- 같은 user+song+type 중복 방지 (dedupe)
   ```
   ※ dedupe를 위해 `UNIQUE (user_id, actor_id, song_id, type)` 부분 인덱스 추가:
   ```sql
   CREATE UNIQUE INDEX idx_notif_dedupe_like
     ON notifications (user_id, actor_id, song_id, type)
     WHERE type = 'like' AND comment_id IS NULL;
   ```
6. Service role client(service.role.key)로 알림 INSERT — RLS 우회

**Errors**: 401 / 404 (곡 없음) / 500

### 4.2 `POST /api/notifications/song-complete` (신규 — Do 단계 변경)

**변경 사유** (Do 단계 발견): `/api/generate`는 클라이언트가 응답을 받아 `songService.save()`로 곡을 DB INSERT하는 구조 → 서버에서는 `song_id`를 알 수 없음. 별도 라우트로 분리.

**흐름**:
```
useSongGeneration:
  fetch /api/generate              → MiniMax URL 받음
  await songService.save(...)      → Supabase songs INSERT (Promise화로 안전성 확보)
  fetch /api/notifications/song-complete { songId }
  dispatch 'notifications-changed'
```

**Request**: `{ songId: string }`
**Response 200**: `{ ok: true }`
**Errors**: 400 (songId 없음) / 401 (인증) / 403 (스푸핑: 본인 곡 아님) / 500

**검증**: 서버에서 `songs.user_id === auth.uid()` 확인 → 다른 사람 곡 ID 위조 차단.

### 4.3 `GET /api/notifications` (신규 — 선택)

**옵션**: 클라이언트에서 Supabase 직접 SELECT vs API route. RLS가 있으므로 직접 SELECT가 단순.

→ **결정: 직접 Supabase SELECT** (notificationService 안에서). API route 만들지 않음.

### 4.4 `PATCH /api/notifications/[id]/read` (신규 — 선택)

마찬가지로 클라이언트에서 `UPDATE notifications SET read_at = now() WHERE id = $1` (RLS로 본인만) — API route 불필요.

→ **결정: 직접 Supabase UPDATE** (notificationService).

### 4.5 Service Role 클라이언트 (Do 단계 갱신)

**기존 `lib/supabase/server.ts:createClient`가 이미 service role 키를 사용** → 신규 admin.ts 불필요. 그대로 재사용.

```ts
import { createClient } from '@/lib/supabase/server'
const admin = await createClient()
await admin.from('notifications').insert({ ... })
```

`createUserClient`는 anon 키 (RLS 적용, 본인 식별용). 두 클라이언트를 라우트에서 함께 사용:
- `createUserClient` → `auth.getUser()`로 인증 확인
- `createClient` → service role로 INSERT (RLS 우회)

---

## 5. UI Design

### 5.1 데스크톱 알림 패널

**위치**: 사이드바(좌측 240px) **위에 오버레이** — 메인 콘텐츠 좌측 일부를 살짝 덮음. Mureka 패턴.

```
┌──────────┬──────────────────┬──────────────────────────┐
│ Sidebar  │ NotifPanel       │ Main Content             │
│ (240px)  │ (~360px overlay) │ (그대로 — 일부 가려짐)    │
│          │ ┌──────────────┐ │                          │
│ • 음악만들기│ │ 알림         │ │                          │
│ • 라이브러리│ │ ──────────── │ │                          │
│ • 탐색    │ │ [item]       │ │                          │
│ • 알림 •  │ │ [item]       │ │                          │
│          │ │ [item]       │ │                          │
│          │ └──────────────┘ │                          │
└──────────┴──────────────────┴──────────────────────────┘
```

**스펙**:
- 폭: `w-[360px]`, 높이: `top: 헤더 아래 ~ bottom: 미니바 위` (헤더 64px + 미니바)
- 위치: `fixed left-[240px] top-[64px] bottom-[156px+safe]`
- z-index: **`z-[58]`** (미니바 z 위, 곡 상세 `z-[55]` 위, SongEditModal `z-[60]` 아래)
- 배경: `bg-[#1c1c1e] border-r border-white/[0.08]` (사이드바와 톤 통일)
- 진입 애니메이션: `translate-x-[-100%] → 0` 200ms ease-out
- 닫기: backdrop 클릭 / ESC / 알림 메뉴 재클릭 / 알림 아이템 클릭(이동 후)
- backdrop: `fixed inset-0 left-[240px] z-[57] bg-transparent`(투명, 클릭 영역만)
- 사이드바 알림 메뉴는 패널 열림 시 활성 스타일 유지

### 5.2 모바일 알림 풀 페이지 (`/notifications`)

- 기존 placeholder 교체
- `(main)/layout.tsx` shell 안에서 일반 페이지로 렌더 — BottomNav·미니바 그대로
- 헤더: "알림" 제목 + 우측 빈 공간 (모바일 안전영역)
- 리스트: NotificationItem 세로 스택, divider `border-b border-white/[0.06]`

### 5.3 NotificationItem 컴포넌트

```
┌──────────────────────────────────────────────┐
│ [아바타]  username님이 노래제목를 좋아했어요  │
│  40x40   3시간 전                            │
│         [미읽음일 때 배경 살짝 보라톤]        │
└──────────────────────────────────────────────┘
```

**타입별 렌더**:

| 타입 | 아이콘/아바타 | 텍스트 | 클릭 후 |
|------|--------------|--------|---------|
| `like` | actor 아바타 | `{actorName}님이 {songTitle}를 좋아했어요` | view-song dispatch |
| `song_complete` | songCover 작게 | `{songTitle} 생성이 완료되었어요` | view-song dispatch |
| `system` | 로고 또는 sparkles SVG | `payload.title` + 1줄 `payload.body` | 인앱 모달 (payload.url 있으면 라우팅) |
| `follow` | actor 아바타 | `{actorName}님이 회원님을 팔로우했어요` | view-profile dispatch |
| `comment` | actor 아바타 | `{actorName}님이 댓글을 남겼어요: "{snippet}"` | view-song dispatch (+ comment anchor) |

**미읽음 표시**: `bg-violet-500/[0.08]` 배경 (읽으면 제거). 좌측에 작은 보라 점 `w-1.5 h-1.5 rounded-full bg-violet-500`.

**시간**: `n분 전 / n시간 전 / n일 전`, 7일 초과 시 `YYYY.MM.DD`.

### 5.4 사이드바 점 배지

```tsx
<Link href="/notifications" ...>
  <Image src="/Notification.svg" ... />
  <span>알림</span>
  {unreadCount > 0 && (
    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500" />
  )}
</Link>
```

데스크톱(`md:`)은 `Link` 대신 `<button>`으로 변경 → 클릭 시 패널 토글 + `pathname` 변경 없음. 모바일은 `Link href="/notifications"` 유지.

### 5.5 BottomNav 점 배지

```tsx
{href === '/notifications' && unreadCount > 0 && (
  <span className="absolute top-1 right-1/2 translate-x-3 w-1.5 h-1.5 rounded-full bg-red-500" />
)}
```

### 5.6 빈 상태

```
        [회색 종 아이콘 또는 Confused.svg]
              아직 받은 알림이 없어요
   곡을 공유하거나 새 곡을 만들어보세요
```

---

## 6. State & Events

### 6.1 shell layout state (`app/(main)/layout.tsx`)

```ts
const [notifPanelOpen, setNotifPanelOpen] = useState(false)
const [unreadCount, setUnreadCount] = useState(0)
```

### 6.2 이벤트 버스 추가

| 이벤트 | detail | 발화 | 수신 |
|--------|-------|------|------|
| `notifications-changed` | — | API like 응답 후, generate 완료 후, panel close 후, item 클릭 후 | shell layout → unreadCount 재조회 |

새 이벤트 추가는 1개만. `view-song`/`view-profile`은 기존 그대로 재사용.

### 6.3 데이터 흐름

```
사이드바 알림 클릭(데스크톱)
  → setNotifPanelOpen(true)
  → <NotificationPanel> 마운트
  → notificationService.list() (RLS로 본인 알림만)
  → 렌더

아이템 클릭
  → notificationService.markAsRead(id)
  → dispatchEvent('notifications-changed')
  → 타입별 라우팅 (view-song / view-profile / system modal)
  → 패널 닫기

shell layout 마운트
  → notificationService.unreadCount()
  → setUnreadCount(n)

notifications-changed 수신
  → notificationService.unreadCount() 재조회
```

---

## 7. UI Component Map

| 파일 | 종류 | 역할 |
|------|------|------|
| `components/NotificationPanel.tsx` | 신규 | 데스크톱 오버레이 + 리스트 컨테이너. 모바일 페이지에서도 리스트 재사용 가능하게 props 분리(`mode: 'overlay' \| 'page'`) |
| `components/NotificationItem.tsx` | 신규 | 단일 아이템 + 타입별 분기 + 라우팅 헬퍼 |
| `app/(main)/notifications/page.tsx` | 수정 | placeholder → `<NotificationPanel mode="page" />` |
| `app/(main)/layout.tsx` | 수정 | 알림 메뉴 데스크톱 button 화 + 패널 마운트 + unreadCount state + 점 배지 |
| `components/BottomNav.tsx` | 수정 | 알림 탭 점 배지 (props로 unread 받기) |
| `services/notification.service.ts` | 신규 | `list()`, `unreadCount()`, `markAsRead(id)` (모두 Supabase 직접) |
| `app/api/songs/[id]/like/route.ts` | 신규 | 좋아요 토글 + 알림 INSERT |
| `app/api/notifications/song-complete/route.ts` | 신규 (Do 단계 추가) | useSongGeneration에서 호출, 본인 곡 검증 + INSERT |
| `features/song/hooks/useSongGeneration.ts` | 수정 (Do 단계 추가) | `await songService.save()` 후 song-complete API 호출 |
| `services/song.service.ts` | 수정 (Do 단계 추가) | `save()` Promise화 — song INSERT 완료 대기 |
| `components/SongDetailPage.tsx` / `GlobalMiniBar.tsx` | 수정 (Do 단계 추가) | 좋아요 isOwner 분기: 책갈피 / 공개 좋아요 API |
| `types/domain.ts` | 수정 | `NotificationType`, `Notification`, `NotificationSystemPayload` 추가 |
| `utils/relativeTime.ts` | 신규 | `n분 전 / n시간 전 / n일 전 / YYYY.MM.DD` |
| `app/globals.css` | 수정 | `@keyframes slideInLeft` (패널 진입 애니메이션) |
| Supabase migration | 신규 | `notifications` 테이블 + RLS + 인덱스 + dedupe UNIQUE |

---

## 8. Test Plan

### 8.1 L1 — API

```
# 좋아요 → 알림 INSERT
curl -X POST /api/songs/{otherUserSongId}/like -b session=<userA>
→ 200 { liked: true, likeCount: ↑ }
→ notifications에 user_id=otherUser, type=like, actor_id=userA 행 1개

# 본인 곡 자기 좋아요는 알림 X
curl -X POST /api/songs/{ownSongId}/like -b session=<userA>
→ 200, notifications에 추가 행 없음

# 두 번째 좋아요 (off → on) 시 dedupe — 새 알림 INSERT 안 됨
curl -X POST /api/songs/{otherUserSongId}/like -b session=<userA>  # off
curl -X POST /api/songs/{otherUserSongId}/like -b session=<userA>  # on
→ notifications 행 1개만 유지 (UNIQUE INDEX)
```

### 8.2 L2 — RLS

```sql
-- userA 세션에서 userB 알림 조회
SET request.jwt.claim.sub = '<userA>';
SELECT * FROM notifications WHERE user_id = '<userB>';
→ 0 rows (RLS 차단)
```

### 8.3 L3 — UI E2E

1. 두 계정 로그인 (브라우저 A, B)
2. B가 A의 공개 곡에 좋아요 → A 새로고침
3. A 사이드바 알림 메뉴에 점 배지 노출 확인
4. A 알림 메뉴 클릭 → 패널 슬라이드 인, 좋아요 알림 1건 노출
5. 알림 클릭 → 곡 상세 열림 + 해당 알림 `read_at` 채워짐 + 배지 사라짐
6. 모바일 사이즈: `/notifications` 라우팅 풀 페이지로 동일 흐름

### 8.4 L4 — 경계

- 알림 0건: 빈 상태 노출
- 30+ 건: 페이지네이션 (limit 30 + "더 보기")
- 곡 삭제된 후 알림: `song_title` join이 NULL → "삭제된 곡" 표기

---

## 9. Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| 좋아요 API 신규 = 기존 `song.service.update({ liked })` 패턴과 혼선 | Design §4.1에 명시: 신규 API는 **공개 좋아요용**. 본인 곡 `liked` 토글(`MyWorkPanel`)은 별도 (내 곡 표시용 책갈피로 해석). 추후 통합 검토 |
| `actor_id NULL`(system)일 때 클라이언트 렌더 분기 누락 | NotificationItem이 type=`system`이면 actor 무시하고 payload만 사용 |
| dedupe UNIQUE INDEX가 like off→on 사이클에 늘 차단 → 새 알림 안 옴 | 의도된 동작. "한 번 좋아요 받음 = 한 번만 알림". 사용자가 취소 후 다시 누른다고 알림이 두 번 오면 스팸 |
| 시스템 공지 broadcast가 사용자 100만이면 100만 행 → 비용 | 1차 사용자 규모(<1만) 충분. 후속 Realtime/별도 broadcast 테이블 고려 |
| 데스크톱 패널 열린 상태에서 라우트 이동 | route 변경 감지해서 `setNotifPanelOpen(false)` (기존 `setSongOverlayOpen(false)` 패턴과 동일) |

---

## 10. Non-Functional Considerations

- **Performance**: 알림 list 쿼리 `select … with profiles join, songs join order by created_at desc limit 30` — 인덱스 `(user_id, created_at desc)` 활용. 측정 목표 < 300ms
- **Security**: RLS + service role INSERT 분리. `NEXT_PUBLIC_*` 키에는 service role 절대 노출 X
- **A11y**: 패널 ESC 닫기, focus trap, `role="dialog" aria-label="알림"`. 점 배지에 `aria-label="새 알림 있음"`
- **i18n**: 한국어 고정 (1차)
- **다크 톤**: `bg-[#1c1c1e]`(패널 배경), `border-white/[0.06]`(divider), `text-zinc-200`(텍스트), `bg-violet-500/[0.08]`(미읽음 배경), `bg-red-500`(배지). 기존 토큰 재사용

---

## 11. Implementation Guide

### 11.1 Decision Record (key choices)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | INSERT는 API 핸들러에서 (trigger X) | 디버깅·로그 추적 쉬움. trigger silent fail 회피 |
| 2 | 시스템 공지는 사용자별 행 복제 | RLS·read 상태 관리 단순. broadcast 테이블 분리는 후속 |
| 3 | dedupe UNIQUE INDEX | 좋아요 off→on 반복 시 알림 1건만 유지 (스팸 방지) |
| 4 | 데스크톱 button 모바일 Link 분기 | 데스크톱은 패널 토글, 모바일은 라우팅. 같은 메뉴 항목 |
| 5 | NotificationPanel `mode` prop | 데스크톱 overlay / 모바일 page 두 컨텍스트에서 리스트 컴포넌트 재사용 |
| 6 | service role: 기존 `lib/supabase/server.ts:createClient` 재사용 (Do 단계 갱신) | 이미 service role 키 사용 — 신규 admin.ts 불필요 |
| 7 | Realtime 미도입 | 1차 트래픽으로 폴링/이벤트 invalidate 충분. 2차 후보 |
| 8 | 페이지 라우트(/api/notifications) X, Supabase 직접 호출 | RLS로 안전, 코드 단순 |

### 11.2 Implementation Order

1. **DB migration**: `notifications` 테이블 + RLS + 인덱스 + dedupe UNIQUE
2. **types**: `Notification`, `NotificationType` 추가
3. **service**: `notification.service.ts` (list, unreadCount, markAsRead)
4. **admin client** 확보 (`lib/supabase/admin.ts`)
5. **API**: `POST /api/songs/[id]/like` 신규 (좋아요 토글 + 알림 INSERT)
6. **API 수정**: `/api/generate`에 `song_complete` INSERT 추가
7. **UI 컴포넌트**: `NotificationItem`, `NotificationPanel`
8. **shell layout 수정**: 사이드바 알림 메뉴(데스크톱 button), 패널 마운트, unreadCount state, 점 배지, route 변경 시 닫기
9. **BottomNav**: 점 배지
10. **`/notifications` 페이지**: `<NotificationPanel mode="page" />`로 교체
11. **이벤트 와이어링**: `notifications-changed`
12. **테스트**: L1 curl, L2 RLS, L3 두 계정 E2E

### 11.3 Session Guide

작업이 한 세션에 끝나기 어렵게 크지 않음(예상 ~600줄). 한 세션에 처리 가능. 굳이 분할한다면:

| Module | 범위 | 비고 |
|--------|------|------|
| `module-data` | 1~4 (migration, types, service, admin) | 백엔드 기반. 단독 검증 가능 |
| `module-api` | 5~6 (like route, generate 수정) | 데이터 모듈 후. curl 테스트 가능 |
| `module-ui` | 7~10 (panel, item, layout, bottomnav, page) | API 끝난 후 UI 통합 |
| `module-wire` | 11~12 (이벤트, 테스트) | 마무리 |

`/pdca do notifications --scope module-data` 식으로 분할 가능.

---

## 12. Open Questions (defer to Do)

- 좋아요 API 신규 라우트와 기존 `song.service.update({ liked })` 통합 시점 — 별도 정리 PR로?
- 시스템 공지 운영자 가이드 문서를 어디 둘 것 (README / 별도 ops 문서)
- 알림 라우팅 후 곡 상세에서 해당 알림으로 다시 돌아오는 UX가 필요한가? (1차 없음으로 가정)
