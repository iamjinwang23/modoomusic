# comments Planning Document

> **Summary**: 곡 상세에 댓글 시스템 — 1단계 대댓글, 좋아요·신고·편집·삭제, 게시자 배지, 이모지 핫키, 사용자명 → 프로필 이동, 신규 댓글/대댓글 알림. 데스크톱은 가사 옆 댓글 패널, 모바일은 가사·댓글 토글.
>
> **Project**: 모두의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-05-31
> **Status**: Done (구현 완료, 2026-05-31 ~ 2026-06-01)
> **Last Updated**: 2026-06-01

> **Implementation Notes (2026-06-01 추가)**:
> - 마이그레이션 014/015/016/017 작성·적용 완료 (017은 수동 SQL Editor 적용 예정)
>   - 014: comments·comment_likes·comment_reports 3테이블 + 트리거 + RLS
>   - 015: body CHECK를 500자로 교체 (기존 row 안전 truncate)
>   - 016: sync_comment_like_count 트리거를 `SECURITY DEFINER`로 (다른 사용자 row UPDATE 시 RLS 우회)
>   - 017: songs.comment_count 컬럼 + top-level 전용 동기화 트리거
> - API 6개 핸들러(5 파일): GET/POST /api/songs/[id]/comments, PATCH/DELETE /api/comments/[id], POST /api/comments/[id]/reply, POST /api/comments/[id]/like, POST /api/comments/[id]/report
> - 컴포넌트 4개: EmojiHotkeyBar(7개+"+"), CommentReportModal(8 사유), CommentItem(인라인 하트 SVG·빨강 fill / 10줄+ 더보기·접기 / 게시자 배지 / 인라인 편집·답글), CommentsPanel(이모지 + textarea 500자 + 카운트)
> - SongDetailPage 통합: 데스크톱 가사·댓글 좌우, 모바일 `[가사|댓글]` 토글
> - 알림: `notifications.type='comment'` + `payload.kind`('comment'|'reply') 분기
> - 댓글 카운트 칩(chat.svg + count)을 모든 곡 표면(상세·리스트·탐색·프로필) 좋아요 다음에 추가
> - 좋아요 아이콘: Thumb-Up → 인라인 하트 SVG(빨강 fill)
> - 액션 라벨: "답글" → "답글달기" (토글 버튼만)
> - 함정 해결: `PublicSong.published` 누락 → `SONG_SELECT`에 `is_public, comment_count` 추가 후 모든 toSong 전파

---

## Executive Summary

| Perspective | Content |
|---|---|
| **Problem** | 곡을 듣고 감상·피드백을 남길 수 있는 소셜 인터랙션이 좋아요·팔로우뿐. 창작자·청자 간 대화 채널 부재 |
| **Solution** | 곡 상세에 댓글(1단계 대댓글) + 좋아요/신고/편집/삭제 + 이모지 핫키 + 게시자 배지. 알림 시스템과 연결 |
| **Function/UX Effect** | 데스크톱은 가사 옆 댓글 패널 동시 노출, 모바일은 가사·댓글 토글로 같은 컴포넌트 재사용. 사용자명 클릭 → 프로필 이동 |
| **Core Value** | 곡 단위로 대화·반응이 누적되며 커뮤니티 활성화. 알림으로 재방문 유도, 창작자 피드백 루프 형성 |

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 곡 단위 대화·피드백 채널이 없음 → 소셜 인터랙션 확장 + 창작자·청자 연결 |
| **WHO** | 모든 로그인 사용자(작성/좋아요/신고). 비로그인은 읽기만 |
| **RISK** | (1) 부정·도배 댓글 → 신고+삭제+영구제한 정책(운영정책 §4·§5 참조) (2) 알림 폭주 → 1단계 깊이로 제한, 본인 활동 알림 제외 (3) 댓글 수 늘면 N+1·페이지네이션 (4) 게시자 표시는 곡 소유자 user_id 비교 |
| **SUCCESS** | 댓글 작성/조회/대댓글/좋아요/신고/편집/삭제 동작 · 데스크톱 가사 옆/모바일 토글 · 알림 도착 · 사용자명→프로필 · 이모지 핫키 동작 |
| **SCOPE** | comments·comment_likes·comment_reports 테이블 + 6개 API 라우트 + CommentsPanel + SongDetailPage 레이아웃 분기. 1차 미포함: 멘션, 타임스탬프, 실시간 push |

---

## 1. Goals

- 곡 상세에 댓글 + 1단계 대댓글 (대댓글의 대댓글 X)
- 댓글 좋아요/신고/편집(내 것)/삭제(내 것, 완전 제거 — 대댓글도 함께)
- 곡 소유자 댓글에 **"게시자"** 배지
- 이모지 핫키 7개: 🔥 😍 😭 🙌 👍 😎 😋 + 입력칸 우측 "+"(추후 picker, 1차는 자리만)
- 사용자명·아바타 클릭 → `view-profile` 이벤트
- 신규 댓글/대댓글 알림 (기존 notifications.type=`comment` 활용)
- 데스크톱: 가사 영역 옆에 댓글 패널 동시 노출
- 모바일: 가사·댓글 **토글** (한 번에 하나, 같은 댓글 컴포넌트 재사용)
- API 키·관리자 권한 분리, 본인만 본인 댓글 편집/삭제

## 2. Non-Goals (1차)

- 댓글 멘션(@username) 인터랙션 — 텍스트로만 작성 가능
- Suno식 **타임스탬프 링크**("at MM:SS" 클릭 시 곡 시점 이동) — 2차로 보류
- 실시간 푸시(다른 사용자 댓글이 내 화면에 즉시 나타남) — 1차는 새로고침/포커스 시 재조회
- 무제한 중첩 대댓글
- 좋아요 자체 알림(댓글이 받은 좋아요로 알림) — 노이즈 우려, 보류
- 정렬: 최신순 고정 (Suno의 Sort by 토글은 2차)
- 페이지네이션 UI — 1차는 모든 댓글 단일 fetch(곡당 100개 미만 가정), 차후 cursor 페이지네이션
- 비공개 곡 댓글 — 곡이 `is_public=true`일 때만 작성/조회

## 3. 핵심 결정 사항

| # | 결정 | 채택 | 이유 |
|---|---|---|---|
| 1 | 대댓글 깊이 | **1단계** (top + replies, no nested) | Suno와 동일, UI/UX 가장 깔끔. 멘션은 텍스트로 |
| 2 | 이모지 핫키 | **Suno 7개** (🔥😍😭🙌👍😎😋) + "+" 버튼(자리만) | 사용자 선택. 친숙한 톤. 차후 picker로 확장 |
| 3 | 타임스탬프 링크 | **제외** (2차) | 1차 부담 최소 |
| 4 | 편집/삭제 | 내 댓글 **항상 편집 가능**(`edited` 표시), 삭제 시 **완전 제거**(`ON DELETE CASCADE`로 대댓글 함께 삭제) | 사용자 선택. 단순·명료 |
| 5 | 정렬 | **최신순 고정** (1차) | 단순. 추천순은 2차 |
| 6 | 알림 트리거 | 곡 소유자에게: 곡에 새 댓글 / 댓글 작성자에게: 내 댓글에 대댓글. **본인이 자기 곡/자기 댓글에 단 경우 알림 제외** | 노이즈 방지 |
| 7 | 게시자 표시 | `comments.user_id === songs.user_id` 일 때 "게시자" 칩 (보라톤 작은 배지) | 댓글 조회 시 join으로 판별 |
| 8 | 비공개 곡 댓글 | **불가** (`songs.is_public = true`만 허용) | RLS로 강제 |
| 9 | 신고 사유 항목 | 운영정책 §5④와 동일 — 욕설·음란물·혐오·도배·광고·개인정보·저작권·기타 | 정책 일관성 |
| 10 | 실시간 동기화 | **비활성 (1차)**. 새로고침·곡 상세 재오픈 시 재조회 | Vercel/Supabase 비용·복잡도. 2차 검토 |

## 4. 데이터 모델 (마이그레이션 014)

```sql
-- 014_comments.sql
CREATE TABLE comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id      uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id    uuid REFERENCES comments(id) ON DELETE CASCADE,   -- NULL = 최상위
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  like_count   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  edited_at    timestamptz                                       -- NULL이 아니면 편집됨
);
CREATE INDEX idx_comments_song_top ON comments(song_id, created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX idx_comments_parent   ON comments(parent_id, created_at)    WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_user     ON comments(user_id);

-- 1단계 깊이 강제: parent의 parent_id가 NULL이어야 함
CREATE OR REPLACE FUNCTION enforce_comment_depth() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM comments WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'comments depth exceeds 1';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER comments_depth_check BEFORE INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION enforce_comment_depth();

CREATE TABLE comment_likes (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id   uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comment_id)
);
CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);

-- 좋아요 카운트 denorm
CREATE OR REPLACE FUNCTION sync_comment_like_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER comment_likes_sync AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION sync_comment_like_count();

CREATE TABLE comment_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id    uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reason        text NOT NULL CHECK (reason IN
    ('욕설·비속어','음란물','혐오·차별 표현','도배','광고·홍보성 콘텐츠','개인정보 노출','저작권 침해','기타')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, comment_id)
);

-- RLS
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;

-- 공개 곡의 댓글만 읽기 (비공개 곡 댓글 차단)
CREATE POLICY "comments_select" ON comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM songs s WHERE s.id = comments.song_id AND s.is_public = true)
  OR auth.uid() = user_id
);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM songs s WHERE s.id = song_id AND s.is_public = true)
);
CREATE POLICY "comments_update" ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "comment_likes_select" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "comment_likes_insert" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comment_likes_delete" ON comment_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "comment_reports_insert" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
-- SELECT/UPDATE는 관리자 전용 (admin client만, RLS 정책 없음으로 차단)
```

## 5. API 라우트 (Next.js Route Handlers)

| Method | Path | 역할 |
|---|---|---|
| GET  | `/api/songs/[id]/comments` | 곡의 댓글 + 대댓글 한 번에(top 정렬 후 부모별 그룹화). `profiles` join 으로 작성자 정보 |
| POST | `/api/songs/[id]/comments` | top-level 작성. body 1~1000자, song.is_public 체크 (RLS와 이중) |
| POST | `/api/comments/[id]/reply` | 대댓글 작성. body, parent_id=:id |
| PATCH | `/api/comments/[id]` | 본인 댓글 body 수정, `edited_at = now()` |
| DELETE | `/api/comments/[id]` | 본인 댓글 삭제 (CASCADE로 대댓글 함께) |
| POST | `/api/comments/[id]/like` | 좋아요 토글 (POST = like, DELETE = unlike 또는 toggle 단일 POST) |
| POST | `/api/comments/[id]/report` | 신고 (reason 본문에 포함). 중복(unique) 시 200 idempotent |

응답: 작성/수정 시 새 row 반환. 좋아요는 `{ liked, likeCount }`.

알림 INSERT (서버 라우트에서, `createAdminClient`):
- top-level 작성 시 → `songs.user_id !== user.id` 인 경우만 notification(`type=comment`, song_id, comment_id, actor_id=user.id)
- 대댓글 작성 시 → 부모 댓글 user_id에게 notification (`type=comment`)
- 둘 다 본인은 자기 자신에게 알림 X

## 6. UI 구조

### 6.1 SongDetailPage 레이아웃

**데스크톱** (현재: 좌=커버·메타·액션, 우=제목·스타일·가사):
- 우측 컬럼을 **가사·댓글 가로 분할**: `md:flex md:flex-row md:gap-6` 안에 가사 섹션 + `<CommentsPanel />`
- 가사·댓글 각각 `overflow-y-auto`로 독립 스크롤
- 가사 영역 폭과 댓글 영역 폭 균형 (`md:basis-1/2` 또는 `md:flex-1`)

**모바일** (현재: 단일 컬럼 스택):
- 가사 섹션 위에 **세그먼트 토글** `[가사 | 댓글]` (활성=흰 바탕+검정, 컨벤션)
- 토글 상태에 따라 가사 또는 `<CommentsPanel />` 한 번에 표시
- 같은 컴포넌트 재사용 — 외형만 토글로 전환

### 6.2 `<CommentsPanel song={song} />` 컴포넌트

```
┌─ 이모지 핫키 행: 🔥 😍 😭 🙌 👍 😎 😋 [+]
│  └ 클릭 시 입력칸에 추가
├─ 입력 영역: 아바타 + textarea "댓글을 남겨주세요" + [작성] (1~1000자)
├─ 카운트: "{n}개의 댓글" (top-level만 카운트)
├─ 리스트 (최신순):
│  ┌─ [Comment]
│  │  - 아바타·사용자명·['게시자' 배지]·상대시간·[(편집됨)]
│  │  - 본문
│  │  - 좋아요 토글(♥) + 좋아요 수 / 답글 / 더보기(•••)
│  │  - 더보기: 본인=편집/삭제, 타인=신고
│  │  - 답글 입력칸(클릭 시 인라인 펼침) + [Reply] 리스트 (들여쓰기)
└─ (페이지네이션 1차 미적용)
```

상호작용:
- 아바타·사용자명 클릭 → `window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))`
- 좋아요 토글: 낙관적 UI(`useOptimisticToggle` 재사용)
- 신고: 모달(운영정책 §5④ 8개 사유 단일 선택) → POST report → "신고가 접수되었어요" 토스트
- 편집: 인라인 textarea로 전환, 저장/취소
- 삭제: 확인 모달 → DELETE
- 이모지 클릭: `input.value += emoji` (커서 위치 삽입은 1차 보너스)
- "+" 버튼: 1차는 disabled + "곧 출시" 토스트 (picker 자리)

### 6.3 게시자 배지

```tsx
{comment.userId === song.userId && (
  <span className="text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full">게시자</span>
)}
```

(곡 상세에서 song.userId를 알고 있으므로 클라이언트 비교)

## 7. 알림 통합

기존 인프라:
- `notifications.type` CHECK에 `'comment'` 이미 포함 (010 마이그레이션)
- `notifications.comment_id` 컬럼 자리만 있음 → 014에서 FK 추가 권장 (`comment_id REFERENCES comments(id) ON DELETE CASCADE`)
- `NotificationPanel.handleClick`은 `comment` 타입을 song 라우팅으로 이미 처리 (alt: 향후 댓글 직접 스크롤도 가능)
- `NotificationItem`에 `'comment'` case 존재 → 메시지 카피 확인 필요

트리거 위치 후보:
- **앱 서버에서 INSERT** (현재 like/follow 패턴) — 014에서 컬럼·FK만 추가, 트리거 안 만듦
- 알림 본문: `actorName` + "회원이 곡 '{title}'에 댓글을 남겼어요" / "회원이 내 댓글에 답글을 남겼어요"

## 8. 영향 범위 (개략 — 상세는 design)

### 신규
- `supabase/migrations/014_comments.sql`
- `services/comment.service.ts` — list/create/reply/update/delete/like/report
- `app/api/songs/[id]/comments/route.ts` (GET, POST)
- `app/api/comments/[id]/route.ts` (PATCH, DELETE)
- `app/api/comments/[id]/reply/route.ts` (POST)
- `app/api/comments/[id]/like/route.ts` (POST)
- `app/api/comments/[id]/report/route.ts` (POST)
- `components/CommentsPanel.tsx`
- `components/CommentItem.tsx`
- `components/CommentReportModal.tsx`
- `docs/01-plan/features/comments.plan.md` (이 문서)

### 수정
- `components/SongDetailPage.tsx` — 데스크톱 우측 컬럼 분할, 모바일 가사·댓글 토글
- `components/NotificationItem.tsx` — comment 메시지 카피 확정
- `types/domain.ts` — `Comment` 타입 + Song에 `commentCount?` (옵션)

### DB·운영
- 마이그레이션 014 수동 적용 (Supabase SQL Editor — MCP 권한 없음, drift 주의)
- 알림 메시지 카피 1회 검토

## 9. Success Criteria

- [ ] 공개 곡 상세에서 로그인 사용자가 댓글 작성·조회 가능
- [ ] 대댓글(1단계) 작성, 2단계 시도는 DB 레벨에서 거부
- [ ] 본인 댓글 편집(`edited` 표시) / 삭제(대댓글 함께 cascade)
- [ ] 댓글 좋아요 토글 + like_count 정확
- [ ] 신고 모달 → 신고 INSERT, 중복 신고는 idempotent
- [ ] 곡 소유자 댓글에 "게시자" 배지
- [ ] 사용자명/아바타 클릭 → `view-profile` 이벤트로 프로필 이동
- [ ] 이모지 핫키 7개 클릭 → 입력칸에 삽입, "+" 버튼은 "곧 출시" 토스트
- [ ] 알림: 곡 소유자가 새 댓글 알림 받음 / 부모 댓글 작성자가 대댓글 알림 받음 (본인 활동은 제외)
- [ ] 데스크톱: 가사 옆 댓글 패널, 모바일: 가사·댓글 토글
- [ ] 비공개 곡에서는 댓글 입력 UI 미노출 (RLS와 클라 양쪽)
- [ ] `pnpm tsc --noEmit` 통과 · 모바일 실기기 확인

## 10. 보류 (2차)

- 멘션(@username) 인터랙션 + 알림
- 타임스탬프 링크 (현재 재생 시점 첨부)
- 실시간 동기화 (postgres_changes)
- 정렬 토글 (최신순/추천순)
- 페이지네이션(cursor) UI
- 이모지 picker 전체 (Twemoji 등)
- 댓글이 받은 좋아요 알림
- 곡 카드/리스트에 댓글 수 노출 (`songs.comment_count` denorm)
- 차단/뮤트(특정 유저 댓글 가리기)
- 관리자 도구 (신고 일괄 조회/처리)

## 11. 작업 전 체크 (AGENTS.md / 컨벤션)

- ⚠️ "이건 평범한 Next.js가 아니다" — Route Handler 가이드 확인 (`node_modules/next/dist/docs/`)
- Supabase 마이그레이션 수동 적용 ([[feedback-code-pitfalls]]) — 014 적용 후 `pg_get_functiondef` 등으로 트리거 확인 권장
- admin client(`createAdminClient`) 사용 위치: 알림 INSERT, like_count 트리거 외 RLS 우회 필요한 곳만
- 사용자 메타 전파: 사용자명·아바타 클릭 → 기존 `view-profile` 이벤트 패턴 재사용 (`[[project-ui-conventions]]`)
- 한국어 UX: 친근 존댓말, 결과 과거형, "신고가 접수되었어요" 등
