# comments Design Document

> **Project**: 모두의 노래 (MONO)
> **Plan**: `docs/01-plan/features/comments.plan.md`
> **Architecture**: **Option C — 실용 균형** (4개 컴포넌트 분리, `useOptimisticToggle`·`view-profile` 이벤트 재사용)
> **Date**: 2026-05-31
> **Status**: Design

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 곡 단위 대화·피드백 채널 부재 → 소셜 인터랙션 확장 + 창작자·청자 연결 |
| **WHO** | 모든 로그인 사용자(작성/좋아요/신고). 비로그인은 읽기만 |
| **RISK** | 부정·도배 댓글(신고/제재 정책으로 대응), 알림 폭주(1단계+자기 활동 제외), 댓글 수 증가 시 N+1·페이지네이션, 게시자 표시 = song.userId 비교 |
| **SUCCESS** | 작성/조회/대댓글/좋아요/신고/편집/삭제 · 데스크톱 옆·모바일 토글 · 알림 · 프로필 이동 · 이모지 핫키 |
| **SCOPE** | 3 테이블 + 6 API + 4 UI 컴포넌트 + SongDetailPage 레이아웃 분기. 멘션·타임스탬프·실시간 push 비포함 |

---

## 1. Overview

곡 상세에 댓글 시스템을 추가. 1단계 대댓글(comments.parent_id NULL/UUID), 좋아요(`comment_likes` denorm), 신고(`comment_reports`), 본인 댓글 편집(`edited_at`)·삭제(CASCADE). 게시자 배지는 `comment.userId === song.userId` 클라이언트 비교. 사용자명·아바타 클릭은 기존 `view-profile` 이벤트로 프로필 이동. 알림은 신규 댓글(곡 소유자) / 대댓글(부모 작성자) 두 시나리오. 데스크톱은 가사 옆 댓글 패널 동시 노출, 모바일은 가사·댓글 토글로 같은 `CommentsPanel`을 재사용.

## 2. Architecture (Option C)

기존 패턴(`useOptimisticToggle`·`view-profile` 이벤트·`createUserClient`/`createAdminClient` 분리·낙관적 UI) 재사용. 4개의 UI 컴포넌트로 책임 분리, 데이터는 `CommentsPanel` 내부 useState + fetch.

```
SongDetailPage
 ├─ 데스크톱 우측 컬럼: <Lyrics/> + <CommentsPanel song={song} />  (가로 분할)
 └─ 모바일: [가사 | 댓글] 토글 → Lyrics 또는 CommentsPanel
                        │
                        ▼
   CommentsPanel
    ├─ <EmojiHotkeyBar onInsert={(e) => activeInput.insert(e)} />
    ├─ 새 댓글 작성 영역 (textarea + 작성 버튼)
    ├─ "{n}개의 댓글" 카운트
    └─ map → <CommentItem comment songOwnerId currentUserId
                            onReply onEdit onDelete onLikeToggle onReport
                            replies={...} />
                  ├─ 본문 + 메타(아바타·이름·게시자배지·시간·edited)
                  ├─ 액션: 좋아요(useOptimisticToggle) · 답글 토글 · 더보기(편집/삭제 또는 신고)
                  ├─ 인라인 답글 입력칸 (펼침 토글)
                  └─ 대댓글 리스트 (들여쓰기, 같은 CommentItem 재사용하되 replyOf 모드)

   <CommentReportModal commentId reasons={...} onClose onSubmitted /> (모달 컨벤션)
```

### Module Map

| Module | 파일 | 유형 | 역할 |
|---|---|---|---|
| M1 DB | `supabase/migrations/014_comments.sql` | 신규 | 3 테이블 + 깊이/좋아요 트리거 + RLS |
| M2 Service | `services/comment.service.ts` | 신규 | list/create/reply/update/delete/like/report (클라 fetch 래퍼) |
| M3 API | `app/api/songs/[id]/comments/route.ts` (GET·POST) · `app/api/comments/[id]/route.ts` (PATCH·DELETE) · `app/api/comments/[id]/reply/route.ts` (POST) · `app/api/comments/[id]/like/route.ts` (POST) · `app/api/comments/[id]/report/route.ts` (POST) | 신규 | 6개 라우트 |
| M4 UI | `components/CommentsPanel.tsx` · `components/CommentItem.tsx` · `components/CommentReportModal.tsx` · `components/EmojiHotkeyBar.tsx` | 신규 | 4 컴포넌트 |
| M5 Layout | `components/SongDetailPage.tsx` · `components/NotificationItem.tsx` · `types/domain.ts` | 수정 | 데스크톱 가사 옆 분할, 모바일 토글, 댓글 메시지 카피, Comment 타입 |

## 3. Data Model

### 3.1 마이그레이션 014 (Plan §4 참조)

3 테이블 + 2 트리거(깊이 1 강제 / like_count denorm) + 8 RLS 정책. 핵심 인덱스:
- `idx_comments_song_top` (song_id, created_at DESC) WHERE parent_id IS NULL — 곡 댓글 페치
- `idx_comments_parent` (parent_id, created_at) — 대댓글 페치
- `idx_comments_user` — 사용자 댓글 조회·CASCADE
- `idx_comment_likes_comment` — like 토글 시 카운트 처리

### 3.2 GET 응답 shape (단일 fetch)

```ts
type CommentRow = {
  id: string
  songId: string
  userId: string
  parentId: string | null
  body: string
  likeCount: number
  liked: boolean              // 현재 사용자 좋아요 여부 (서버 join)
  createdAt: string
  editedAt: string | null
  user: { username: string; displayName: string | null; avatarUrl: string | null; avatarHue: number | null }
}
// 응답: { comments: CommentRow[] }  // top + replies 모두, 클라에서 parentId로 그룹화
```

클라이언트에서 `top = comments.filter(c => !c.parentId)`, `repliesByParent = groupBy(comments.filter(c => c.parentId), 'parentId')`.

### 3.3 Comment 타입 (types/domain.ts 추가)

```ts
export interface Comment {
  id: string; songId: string; userId: string; parentId: string | null
  body: string; likeCount: number; liked: boolean
  createdAt: string; editedAt: string | null
  user: { username: string; displayName: string | null; avatarUrl: string | null; avatarHue: number | null }
}
```

## 4. API Contract

| Method | Path | Body | 응답 (200) | 에러 |
|---|---|---|---|---|
| GET  | `/api/songs/[id]/comments` | — | `{ comments: Comment[] }` | 404 곡 없음 / 403 비공개 곡(비소유자) |
| POST | `/api/songs/[id]/comments` | `{ body: string }` | `{ comment: Comment }` | 401·400(빈/1000자 초과)·403(비공개) |
| POST | `/api/comments/[id]/reply` | `{ body: string }` | `{ comment: Comment }` | 401·400·404·409(2단계 시도 — 트리거 에러 변환) |
| PATCH | `/api/comments/[id]` | `{ body: string }` | `{ comment: Comment }` | 401·403(타인)·400 |
| DELETE | `/api/comments/[id]` | — | `{ ok: true }` | 401·403 |
| POST | `/api/comments/[id]/like` | — | `{ liked: boolean; likeCount: number }` | 401·404. **토글** (있으면 unlike, 없으면 like, idempotent) |
| POST | `/api/comments/[id]/report` | `{ reason: string }` | `{ ok: true }` (중복도 200) | 401·400(잘못된 reason) |

### 4.1 알림 INSERT (서버 라우트 내 `createAdminClient`)

| 트리거 | 조건 | 알림 |
|---|---|---|
| 새 top-level 댓글 | `song.user_id !== auth.uid()` | `notifications(type='comment', user_id=song.user_id, actor_id=auth.uid(), song_id, comment_id)` |
| 새 대댓글 | `parent.user_id !== auth.uid()` | `notifications(type='comment', user_id=parent.user_id, actor_id=auth.uid(), song_id, comment_id)` |

본인 활동(곡 소유자 본인이 자기 곡에 댓글 / 댓글 작성자 본인이 자기 댓글에 대댓글)은 알림 미생성.

### 4.2 service.comment 클라 래퍼 시그니처

```ts
listForSong(songId): Promise<Comment[]>
create(songId, body): Promise<Comment>
reply(parentId, body): Promise<Comment>
update(id, body): Promise<Comment>
remove(id): Promise<void>
toggleLike(id): Promise<{ liked: boolean; likeCount: number }>
report(id, reason): Promise<void>
```

## 5. UI Components

### 5.1 `<EmojiHotkeyBar />`
- Suno 7개 이모지 버튼 + "+" 버튼(disabled, 클릭 시 toast.info '곧 출시될 기능이에요')
- Prop: `onInsert(emoji: string)`
- 클릭 시 현재 활성 input(`CommentsPanel`이 추적)에 이모지 텍스트 삽입
- 스타일: 둥근 정사각형 버튼, h-10, gap-2

### 5.2 `<CommentsPanel song />`
- 상태: `comments: Comment[]`, `body`(새 댓글), `loading`, `submitting`, `replyTarget`(어떤 댓글에 답글 입력 펼침), `editTarget`(어떤 댓글 인라인 편집), `reporting: Comment | null`
- 마운트 시 GET 호출 → setComments. `song-comments-changed` 이벤트로 재조회 가능(향후 실시간 대비).
- 활성 입력 ref 추적: `activeInputRef`(이모지 삽입 대상)
- 자식: `<EmojiHotkeyBar onInsert={(e) => insertIntoActive(e)} />`
- 새 댓글 작성: textarea(1~1000) + [작성]. 빈 값 disable. 작성 시 `service.create` → 응답을 `comments`에 prepend, body 비움
- "{topCount}개의 댓글" 라벨
- 리스트: `topComments.map(c => <CommentItem ... replies={repliesByParent.get(c.id) ?? []} />)`
- 신고 모달: `{reporting && <CommentReportModal comment={reporting} onClose onSubmitted />}`

### 5.3 `<CommentItem comment songOwnerId currentUserId replies ... handlers />`
- Props: `comment`, `songOwnerId`, `currentUserId`, `replies?: Comment[]`(top일 때만), `isReply?: boolean`, 핸들러 다수(onReply/onEdit/onDelete/onLikeToggle/onReport/onInputFocus)
- 헤더: 아바타(클릭→view-profile) · 이름(클릭→view-profile) · {게시자 배지} · 상대시간 · {edited}
- 본문 또는 (편집 중일 때) inline textarea + 저장/취소
- 액션 행: ♥(useOptimisticToggle, 좋아요수) · 답글 토글(top일 때만) · 더보기(•••)
  - 더보기 메뉴: `userId === currentUserId` → 편집/삭제 / 그 외 → 신고 (MoreMenu 컨벤션 재사용)
- 답글 입력칸: `replyOpen && (<textarea + 작성>)` — top일 때만
- replies 렌더: `replies.map(r => <CommentItem comment={r} isReply ... />)` (같은 컴포넌트, 재귀 X — replies prop은 비워서 전달)

### 5.4 `<CommentReportModal comment onClose onSubmitted />`
- 8개 사유(운영정책 §5④와 동일) 단일 선택 라디오
- 모달 컨벤션(`[[project-ui-conventions]]`): 모바일 바텀시트·데스크톱 중앙 480px·SongEditModal 패턴
- 제출 시 service.report → toast.success '신고가 접수되었어요' → onClose
- 중복 신고(API 200 멱등)는 동일 토스트

## 6. State & Data Flow

- 마운트 시 한 번 GET → `comments` 배열
- **낙관적 좋아요**: 기존 `useOptimisticToggle` 패턴 — 상태/카운트 즉시 변경, 실패 시 롤백
- **편집**: PATCH 후 응답으로 해당 row 교체 + `editedAt` 표시
- **삭제**: DELETE 후 `comments = comments.filter(c => c.id !== id && c.parentId !== id)` (대댓글도 정리)
- **신규/대댓글**: POST 후 응답 row를 `comments`에 추가 (top은 prepend, reply는 부모 그룹에 append)
- **실시간 동기화 없음** (1차): 다른 사용자 활동은 페이지 재진입/새로고침에서 반영

## 7. SongDetailPage 레이아웃 변경

### 7.1 데스크톱 (md+)
현재 우측 컬럼 `flex-1 md:overflow-y-auto px-5 md:py-5 md:pr-6 md:pl-1 pb-8` 안에 제목·스타일·가사가 세로로 있음. 변경:
- 우측 컬럼을 **가로 두 패널**로 분할: `md:flex md:flex-row md:gap-5`
  - **좌측(가사)**: `md:flex-1 md:overflow-y-auto md:min-w-0` — 기존 제목·스타일·가사 그대로
  - **우측(댓글)**: `md:flex-1 md:overflow-y-auto md:min-w-0 md:border-l md:border-white/[0.06] md:pl-5` — `<CommentsPanel />`

### 7.2 모바일 (< md)
가사 위에 **세그먼트 토글** `[가사 | 댓글]`(활성 흰 바탕+검정, h-9, 컨벤션):
```tsx
const [tab, setTab] = useState<'lyrics' | 'comments'>('lyrics')
{tab === 'lyrics' ? <Lyrics .../> : <CommentsPanel song={song} />}
```

비공개 곡(`!song.isPublic`)이면 댓글 탭/패널 미노출 (또는 "비공개 곡은 댓글을 사용할 수 없어요" 안내).

## 8. Notification 통합

- 알림 INSERT: 라우트 핸들러에서 직접 `createAdminClient().from('notifications').insert(...)` (`like_count`처럼)
- `NotificationItem` `comment` case 메시지:
  - `${actorName}님이 곡 '${songTitle}'에 댓글을 남겼어요` (top-level)
  - `${actorName}님이 내 댓글에 답글을 남겼어요` (대댓글)
  - top vs reply 구분은 알림 row에 별도 컬럼이 없으므로 **comment_id로 comment.parent_id 조회**하거나 payload에 `kind: 'comment'|'reply'` 저장
  - 구현 단순화: `notifications.payload` jsonb에 `{ kind: 'comment'|'reply', songTitle }` 캐싱 (현재 follow도 username 캐싱 중)
- `NotificationPanel.handleClick`: 기존 로직(comment+songId 있으면 view-song 디스패치)이 이미 동작. 향후 "해당 댓글로 스크롤"은 2차

## 9. Error Handling

| 상황 | 처리 |
|---|---|
| 401 미인증 | `window.dispatchEvent(new Event('open-login'))` |
| 403 비공개 곡 댓글 시도 | toast.error '비공개 곡엔 댓글을 남길 수 없어요' |
| 400 빈/1000자 초과 | textarea maxLength 1000 + 빈 값 버튼 disable로 사전 차단 |
| 409 2단계 시도 | API에서 차단(클라가 reply 버튼 노출 안 함 → 발생 가능성 ↓) |
| 좋아요 실패 | `useOptimisticToggle` 롤백 + toast.error '좋아요에 실패했어요' |
| 신고 중복 | 200 멱등 → 동일 성공 토스트 |
| 삭제 실패 | toast.error + 상태 복원 |

## 10. Test Plan

**L1 — API**
- GET 곡 없음 → 404, 비공개 곡 비소유자 → 403
- POST 빈 body → 400, 1001자 → 400, 비공개 곡 → 403
- POST reply 2단계(parent의 parent 존재) → 409
- PATCH 타인 댓글 → 403, 본인 → 200 + edited_at 설정
- DELETE 본인 → 200, RLS로 타인 차단
- like POST 토글 → 첫 호출 liked=true·+1, 재호출 liked=false·-1
- report 첫 → 201, 동일 reporter 재 → 200 멱등

**L2 — UI**
- 로그인 사용자: 댓글 작성/대댓글/편집/삭제/좋아요/신고 전부 가능
- 비로그인: 입력칸 클릭 → 로그인 모달
- 게시자 댓글에 '게시자' 배지 노출
- 이모지 핫키 클릭 → 현재 활성 input에 이모지 삽입
- "+" 버튼 클릭 → '곧 출시될 기능이에요' 토스트
- 사용자명/아바타 클릭 → 프로필 이동
- 모바일 토글: 가사 ↔ 댓글 전환, 같은 컴포넌트 재사용
- 데스크톱: 가사 옆 댓글 패널 동시 노출, 각자 독립 스크롤
- 알림: 다른 계정으로 댓글 → 곡 소유자에게 알림 도착, 대댓글 → 부모 작성자에게 도착, 본인 활동은 알림 없음

**L3 — E2E**
- 사용자 A 곡 게시 → 사용자 B 댓글 → A에게 알림 → A가 알림 클릭 → 곡 상세 이동
- A가 B 댓글에 답글 → B에게 알림
- A가 자기 댓글 편집 → edited 표시
- B가 A 댓글 신고 → reports row 생성, 중복 신고는 멱등

## 11. Security

- `MINIMAX_API_KEY` 무관 (외부 API 호출 없음)
- 인증: `createUserClient().auth.getUser()` — 모든 mutate 라우트에서
- RLS:
  - SELECT: 공개 곡 댓글 또는 본인 댓글
  - INSERT: 본인 user_id + 공개 곡
  - UPDATE/DELETE: 본인만
  - 알림 INSERT: 서버 라우트의 `createAdminClient()` 전용 (`[[feedback-code-pitfalls]]`)
- 길이 제한: server-side 1~1000자 (DB CHECK + 라우트 사전 검증)
- 신고 reason 화이트리스트 8개 (CHECK 강제)
- 본인 신고 방지는 운영 정책(허위 신고 3회 누적 영구 제한)으로 대응 — DB 강제 X (1차)

## 12. Implementation Guide

### 12.1 구현 순서
1. **M1** 014 마이그레이션 작성 → Supabase SQL Editor 수동 적용 + `pg_get_functiondef` 트리거 확인
2. **M2** `services/comment.service.ts` (fetch 래퍼)
3. **M3** API 라우트 5파일(6 핸들러) — 인증·권한·알림 INSERT
4. **M4** 컴포넌트 4개 — EmojiHotkeyBar → CommentReportModal → CommentItem → CommentsPanel
5. **M5** SongDetailPage 레이아웃 분기 + NotificationItem 카피 + Comment 타입 추가
6. 검증: L1(curl) → L2(브라우저, 모바일 토글 포함) → `pnpm tsc --noEmit`

### 12.2 의존성
- 신규 npm 패키지 없음 (이모지는 유니코드 문자열, picker는 2차)
- `useOptimisticToggle` 재사용(`features/song/hooks` 또는 `hooks/` 위치 확인 후 import)

### 12.3 Session Guide
- **Session 1 (백엔드)**: M1 + M2 + M3 — 마이그레이션·서비스·라우트. L1 curl 검증으로 종료
- **Session 2 (프론트)**: M4 — 4개 UI 컴포넌트. 모달·핫키·아이템 패턴 통합
- **Session 3 (통합)**: M5 — SongDetailPage 레이아웃 분기 + 알림 카피. L2/L3 브라우저 검증
- `--scope` 예: `/pdca do comments --scope M1,M2,M3` (백엔드만)
