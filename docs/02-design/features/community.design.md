# 커뮤니티(카페) — 기획 & 아키텍처

> 작성 2026-06-29 · 갱신 2026-07-01 · 브랜치 `feat/community`(미커밋)
> "곡 = 블로그(개인), 커뮤니티 = 카페(그룹)"
> 마이그레이션 043~048 회사 Supabase 적용 완료. Phase 1 + 댓글 완전판·게시글 신고(어드민 큐)·매니저 편집(커버 초점/대표 이미지/정보)·멤버 모달·관리자 다중 개설까지 구현.

---

## 1. 배경 · 의사결정

대표 요청으로 "사람들이 소통하는 카페 같은 공간"을 도입. 사용자/홍보 전 단계의 cold-start라 "빈 게시판 死" 리스크가 큼.

**사례 조사 (2026-06-25)**
- Suno: 토론 커뮤니티 = Discord. 앱은 생성+공유+발견.
- Udio: 네이티브 = 곡 퍼블리시+감상, 토론은 외부(Reddit 12K·Discord 17K).
- 스타트업 교훈: cold-start 커뮤니티는 외부(Discord)가 기본. 네이티브 포럼은 의식·기여경로 없으면 "메시지 대기실"로 죽음.

**결론**: 조사상 네이티브 카페는 비추였으나, **대표 의향 + 사용자 결정으로 네이티브 다중 카페 채택**. 대신 곡 중심(곡 첨부)·인기 집계 허브로 cold-start를 완화.

---

## 2. 모델

| 개념 | 설명 |
|---|---|
| **커뮤니티(카페)** | 주제 기반 그룹. 커버·이름·주제·소개. 매니저 = 생성자. |
| **멤버십(가입)** | 유저가 카페에 가입. 멤버만 글쓰기. 가입은 여러 개 가능. |
| **글(뉴스피드)** | 멤버가 카페에 작성. 텍스트 + 내 곡 첨부 + (예정)이미지. 좋아요·댓글. 인기글 상단 고정. |
| **허브** | 커뮤니티 메인. 인기·신규·내 가입·인기글. |

---

## 3. 정책 (스키마·라우트에 인코딩)

- **개설**: 처음부터 오픈. **1인 1개** — 단 **관리자(`profiles.is_admin`)는 예외로 다중 개설**(테스트·운영용, mig 047에서 `manager_id UNIQUE` 제거·앱 레벨 가드로 이관). 개설자 자동 가입.
- **가입**: 로그인 유저 누구나, 다수 가능 (`(community_id,user_id)` PK).
- **탈퇴**: 멤버 가능. **매니저는 탈퇴 불가** → 폐쇄만.
- **폐쇄**: 매니저만. 하드 삭제 + cascade(멤버·글·댓글·좋아요·신고). 곡 자체는 삭제 안 함(`song_id ON DELETE SET NULL`). 폐쇄 UI는 **매니저 편집 모달 하단 danger 존**.
- **정보 수정**: 매니저만 — 이름(2~30자)·주제·소개·커버·대표 이미지(`PATCH /api/communities/[id]` + 이미지 라우트).
- **글쓰기**: 멤버(매니저 포함). 읽기는 공개.
- **글 수정**: 작성자 본인(본문). **삭제(글)**: 작성자 또는 매니저.
- **고정**: 매니저만.
- **좋아요**: 글·댓글 모두 로그인 유저 누구나.
- **댓글**: 로그인 유저 작성. **대댓글(1단계, parent_id)**·**수정(작성자, edited_at)**·**삭제(작성자 또는 커뮤니티 매니저, 대댓글 CASCADE)**·**좋아요**. 노래 댓글과 동일 UX.
- **신고**: 게시글 신고 → **어드민 신고 큐 통합**(`community_post_reports`). 인정(upheld) 시 `community_posts.status='hidden'` 블라인드. 신고자는 즉시/새로고침 후 숨김(본인 SELECT 정책).

---

## 4. 데이터 모델 (마이그레이션 043~048)

```
communities(id, manager_id→profiles [043 UNIQUE→047 제거], name, topic, description,
            cover_image, cover_focus[048], avatar_image[046], member_count, created_at, updated_at)
community_members(community_id→communities, user_id→profiles, joined_at)  PK(community_id,user_id)
community_posts(id, community_id→communities, author_id→profiles, content,
            image_url, song_id→songs(SET NULL), pinned, like_count,
            comment_count, status[active|hidden], created_at, updated_at)
community_post_comments(id, post_id→community_posts, user_id→profiles, body, created_at,
            parent_id→self(CASCADE)[044], edited_at[044], like_count[044])
community_post_likes(post_id→community_posts, user_id→profiles)  PK(post_id,user_id)
community_post_comment_likes(comment_id→comments, user_id→profiles)  PK [044]
community_post_reports(id, reporter_id→profiles, post_id→community_posts, reason CHECK,
            created_at, resolved_at, resolution, resolution_memo, resolved_by,
            UNIQUE(reporter_id,post_id)) [045]   -- song_reports/comment_reports 미러
```

**마이그레이션 요약**
- **043**: 코어 테이블 5종 + 카운트 트리거 + RLS.
- **044**: 댓글 대댓글(parent_id)·edited_at·like_count + `community_post_comment_likes` + 좋아요 카운트 트리거.
- **045**: `community_post_reports`(신고, 어드민 큐).
- **046**: `communities.avatar_image`(대표 이미지) + `community-images` Storage 버킷(공개 읽기, 쓰기는 admin).
- **047**: `manager_id UNIQUE` 제거(관리자 다중 개설) + 조회 인덱스.
- **048**: `communities.cover_focus`(상세 배너 초점 = CSS object-position).

- **카운트 트리거**: member_count / post like_count / comment_count / **comment like_count** 자동 유지.
- **RLS**: 읽기 공개(active 글만·신고는 본인만), 쓰기 정책 미생성 = 모든 쓰기는 **서버 라우트(admin client)**가 정책 가드 후 수행. 신고 insert/select(own)만 정책 존재.
- ⚠️ **PostgREST 임베드 함정**: comments·likes가 junction으로 해석돼 `community_posts↔profiles` 경로 모호 → 임베드는 **`profiles!author_id`, `songs!song_id`, `profiles!user_id`** FK 명시 필수. (plain SELECT는 통과해도 insert…select에서 500)

---

## 5. API

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/communities` | 허브(인기·신규·내가입·인기글) |
| POST | `/api/communities` | 개설(1인1개) |
| GET | `/api/communities/[id]` | 상세 + 멤버 |
| DELETE | `/api/communities/[id]` | 폐쇄(매니저) |
| POST | `/api/communities/[id]/join` · `/leave` | 가입 · 탈퇴 |
| PATCH | `/api/communities/[id]` | 정보 수정(매니저: 이름·주제·소개) |
| POST | `/api/communities/[id]/image` | 커버/대표 이미지 업로드(매니저, multipart). cover는 원본 저장 + `focus` |
| GET·POST | `/api/communities/[id]/posts` | 피드 · 글작성(멤버) |
| PATCH·DELETE | `/api/community-posts/[postId]` | 본문수정(작성자) · 삭제(작성자·매니저) |
| POST | `/api/community-posts/[postId]/like` | 글 좋아요 토글 |
| POST | `/api/community-posts/[postId]/pin` | 고정(매니저) |
| POST | `/api/community-posts/[postId]/report` | 게시글 신고(멱등) |
| GET·POST | `/api/community-posts/[postId]/comments` | 댓글 목록(중첩·liked)·작성(parentId 대댓글) |
| PATCH·DELETE | `/api/community-comments/[commentId]` | 댓글 수정(작성자)·삭제(작성자·매니저) |
| POST | `/api/community-comments/[commentId]/like` | 댓글 좋아요 토글 |

- 어드민: `/api/admin/reports`(GET에 `community_post` 통합)·`/api/admin/reports/[type]/[id]/resolve`(type=`community_post`, upheld→status=hidden). 어드민 페이지 `/admin/reports`에 유형 배지 "게시글" 추가.
- 서비스: `services/community.service.ts`(+updateCommunity), `services/community-post.service.ts`(+editPost·editComment·deleteComment·toggleCommentLike·중첩 listComments), `services/report.service.ts`(+reportCommunityPost·getMyReportedPostIds), `services/storage.service.ts`(+uploadImageBuffer). 전부 `createAdminClient` + 라우트에서 `createUserClient`로 인증.

---

## 6. UI

- **`/community` 허브**: "＋ 만들기"(CreateCommunityModal). 섹션 레이블 화이트·크게(`text-lg font-bold`). 내 커뮤니티 · **인기 글(캐러셀, 우측 그라데이션 페이드=둘러보기와 동일)** · 인기 커뮤니티 · 새로 생긴. 카드 = 16:9 커버(`object contain`으로 원본 잘림 없이·셰이드 없음) + 이미지 **아래** 이름·`멤버 N · 카테고리`.
- **`/community/[id]` 카페**:
  - 커버: 유튜브 배너형 **풀폭** `w-full aspect-[9/4] md:aspect-[7/2] max-h-[300px]`, `background-position: cover_focus`(초점). (⚠️ aspect+max-h는 `w-full` 필수.)
  - 타이틀 행: **좌측 사각 대표 이미지(96px, avatarImage)** + 이름 + (아랫줄)멤버. 우측 끝 **역할별 버튼 한 자리**(매니저=수정 / 멤버=탈퇴하기 / 비회원=가입하기, 프로필 토큰 통일). **모바일은 커버 우상단 오버레이**(프로필과 동일). 그 아래 소개 → 카테고리 칩.
  - 멤버 스택 클릭 → **`CommunityMembersModal`**(전체 멤버, 매니저 상단·칩).
  - 매니저 "수정" → **`CommunityEditModal`**: 커버(원본 저장 + CropModal **focus 모드**로 상세 배너 초점 지정)·대표 이미지(1:1 크롭)·이름·주제·소개 + 하단 **폐쇄**(danger).
  - 글쓰기(멤버·매니저): 텍스트 + **♪ 내 곡 첨부**. 게시글 헤더 **우측 상단 ⋯ 더보기**(수정=본문 인라인 / 삭제=ConfirmModal / 신고=CommunityPostReportModal / 고정=매니저). 작성자가 매니저인 글엔 **"매니저" 칩**.
  - 피드: 작성자·시각·내용·**첨부곡 카드(클릭=view-song 재생)**·좋아요·댓글(**`CommunityCommentItem`**: 좋아요·답글·수정·삭제·중첩).
- **내비**: 하단바 6칸 + 데스크탑 사이드바에 "커뮤니티"(`chat.svg`).
- **이미지 초점 아키텍처**: 커버 원본 전체 저장(홈 16:9 contain으로 정체성 표시) + `cover_focus`(object-position)로 상세 배너(7:2 cover)에서 보일 밴드만 지정. `CropModal` focus 모드 = 파괴적 크롭 대신 초점 좌표 반환(zoom 잠금·onMediaLoaded로 natural size). 대표 이미지는 1:1 파괴적 크롭.

---

## 7. 단계 / 남은 것

- **Phase 1 + 확장 (구현 완료, 미커밋)**: 코어(텍스트+곡) + **댓글 완전판**(대댓글·수정·삭제·좋아요) + **게시글 더보기(수정/삭제/신고→어드민 큐)** + **매니저 편집 모달**(커버 초점·대표 이미지·정보·폐쇄) + **멤버 리스트 모달** + **매니저 칩** + 허브 카드 리디자인 + **관리자 다중 개설**. 마이그레이션 043~048 적용 완료.
- **Phase 1.5 (부분 완료)**: 커뮤니티 **커버·대표 이미지 업로드 완료**(`community-images` 버킷 + focal). 남음: **글 사진 첨부**, 비공개곡 첨부 재생(현재 공개곡만).
- **Phase 2**: 리믹스 — 곡에서 리믹스 생성(MiniMax 참조음원) → `songs.parent_song_id` 계보 → 원곡에 리믹스 리스트업.
- **Phase 3**: "팔로워 가입 커뮤니티" 허브 섹션 · 채널 페이지/탭 · 주제 탐색 · 카테고리 게시판(트래픽 후).

---

## 8. 알려진 함정

- PostgREST 임베드 FK 명시 (§4).
- aspect-ratio + max-height 너비 축소 → `w-full` 명시 (§6).
- 마이그레이션은 수동 적용 — repo 파일과 drift 가능.
- 커버 초점: 원본 저장 + object-position이라 **파괴적 크롭 아님** — 구 데이터(7:2로 잘려 저장된 커버)는 재업로드해야 원본 복원.
- `manager_id UNIQUE` 제거(047) 후 일반 유저 1인 1개는 **앱 레벨 가드**만 — 동시요청 극단 케이스는 미방어(정상 사용 충분).
