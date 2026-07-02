# 커뮤니티(카페) — 기획 & 아키텍처

> 작성 2026-06-29 · 갱신 2026-07-01(세션2) · 브랜치 `feat/community`
> "곡 = 블로그(개인), 커뮤니티 = 카페(그룹)"
> 마이그레이션 043~052. Phase 1 + 댓글 완전판·신고(어드민 큐)·매니저 편집·멤버 모달·관리자 다중 개설 + **미디어(이미지·임베드·OG)·투표·곡 임베드 카드·모더레이션(강퇴)·금칙어·약관개정**(§9). 프로덕션은 **준비중 게이팅**(NODE_ENV) 유지.

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
- 금칙어 부분일치 오탐(새끼→고양이 새끼)·우회(시123발) 한계 — 어드민 관리로 보완, 추후 AI 모더레이션.
- 곡 제목·프로필은 클라 직접 쓰기 → DB 트리거로 차단하나 낙관적 UI라 새로고침 전까진 화면에 남음.

---

## 9. 추가 구현 (2026-07-01 세션2)

**미디어 / 임베드 (mig 049)**
- 글에 `image_urls text[]`(최대 10, webp)·`link_url`. 업로드 `/api/communities/[id]/post-images`(멤버 가드, sharp webp), 표시 `PostImageGallery`(캐러셀+라이트박스).
- 링크: 화이트리스트 provider(유튜브·유튜브뮤직·스포티파이·애플뮤직·사운드클라우드·비디오)면 iframe 임베드(`utils/embed.ts`·`PostEmbed`), 그 외엔 **OG 프리뷰 카드**(`/api/og`·`LinkPreviewCard`). 본문 첫 URL 자동 감지·링크화.
- 곡 첨부 = **스포티파이식 임베드 카드**(`SongEmbedCard`) — 커버 블러 배경·세로 2:3·미니 플레이바. 재생/상세는 `useGlobalPlayer` 연동(미니바 노출), 상세는 `getShareSongById`로 전체 데이터 fetch(공개곡).

**투표 (mig 050)**
- 단일 선택·게시 24h 후 종료. `community_post_polls`·`community_post_poll_votes`(1인1표). `PollCard`(투표 전=버튼, 후=막대+%·본인 선택 흰색 강조 + `mix-blend-difference`로 텍스트 자동 반전). 집계는 `fillPolls` 배치.

**모더레이션**
- 매니저 **강퇴**(`kickMember`·`/kick`)·게시물 삭제 → 대상에게 **알림(인앱+웹푸시)** `notifyCommunityModeration`.
- **미가입 참여 게이팅**: 좋아요·댓글·투표는 멤버만(`memberGate`), 미가입 시 "가입해주세요" 스낵바.

**금칙어 (mig 051·052)**
- `banned_words` 테이블 + 시드 ~65 + 어드민 `/admin/banned-words`(CRUD). `moderation.service.findBannedWord`(정규화 부분일치·60s 캐시).
- 라우트 검사: 커뮤니티 글·댓글·이름/소개, **노래 댓글**. DB 트리거(052): **곡 제목·공개코멘트·프로필 이름·소개**(클라 직접 쓰기 경로).

**약관/정책 개정 (2026-07-01)**
- 이용약관 제9조의2(커뮤니티 운영)·제10조(서비스 내 신고), 운영정책 제4조⑧·제5조의2·제7조, 개인정보 제1조. 회원 불리 변경이라 정식 공개 시 30일 전 공지 권장.

**UI 폴리시**
- 모바일 피드 라인 구분(풀폭, `divide-y`), 상세 헤더/피드 스켈레톤 정합, 커버 하단 30% 블렌드, 상단고정 배너(핀 아이콘·구분선), 작성 박스 auto-grow+500자 CharCount+`+`메뉴, 허브 인기글 세로 리스트(커뮤니티명·대표이미지), 카드 대표이미지·contain→cover.

## 10. 글 수정 리팩터링 (2026-07-02 세션3)

**모달 전환** — 글 수정은 인라인 편집 → **`CommunityPostEditModal`(Portal + 배경 잠금)**. 인라인 편집 시 위쪽 새 글 작성이 동시 가능하던 문제·취소저장 배치 문제 해소. 상세 페이지는 `editingPost` state + `onEditSaved(patch)` 얕은 병합으로 목록 갱신.

**첨부 규칙** — 원글에 첨부(곡/이미지/레거시 imageUrl/링크/투표) 있으면 **본문 텍스트만 수정**(첨부 편집 불가), 모달에 원글 첨부를 **읽기전용 미리보기**(`pointer-events-none`)로 표시. 텍스트만 있던 글이면 **음악/이미지/투표 중 하나만** 추가 가능(알약 버튼, 활성 시 나머지 숨김).

**임베드 일원화** — 임베드 첨부 버튼/입력 UI **전면 제거**(새 글·수정 양쪽). 본문에 URL 넣으면 `firstUrl` 자동 감지 → `PostEmbed`·유튜브 썸네일 렌더. 인기글 카드(`community/page.tsx PopularPostCard`)도 `p.linkUrl || firstUrl(p.content)`로 썸네일 추출(본문 URL 대응). `attachedLink`/`urlInputOpen` 죽은 코드 제거. `editPost`는 `link_url`을 **보존만**(편집 대상 아님), API PATCH도 `linkUrl` 파라미터 제거.

**editPost 시그니처** — `editPost(userId, postId, content, imageUrls?, songId?, pollOptions?)`. `hadAttachment` 글은 클라가 `{content}`만 전송 → 서버는 이미지/곡/링크 기존값 보존. empty 체크는 기존 첨부(`song_id`·`image_url`·`image_urls`·`link_url`·poll) 고려.

**수정 중 UX** — 모달이므로 더보기(⋯)는 항상 노출(인라인 상태 없음). 빈 본문+첨부없음 저장 시 토스트 안내.

## 11. 소셜 알림·전체보기·프로필 이동 (2026-07-02 세션3, 커밋 6f5e8dc 배포 — 준비중 유지)

**소셜 알림 (mig 053)** — 커뮤니티 좋아요·댓글·답글 → 인앱 + 웹푸시. `notifications.type`에 **`community_like`·`community_comment`** 추가(053 CHECK 갱신). `community-post.service.notifyCommunityActivity` 헬퍼(actor_id + payload `{url, postId, communityId, kind}` + `sendPushToUser`).
- 댓글 → 글 작성자, 답글 → 부모 댓글 작성자, 좋아요 → 글 작성자. **본인 제외**, **좋아요 중복 방지**(같은 recipient·actor·postId 있으면 스킵, `payload->>postId`).
- 렌더: actor 아바타 + "…님이 회원님의 글을/댓글에 …". 라우팅: payload.url → `/community/[id]?post=[postId]`.

**알림 필터 알약** — 알림 페이지/오버레이 헤더 아래 `전체·음악·커뮤니티·새소식`. `categoryOf(n)`: community_* → 커뮤니티, system은 url이 `/community`면 커뮤니티(모더레이션)·아니면 새소식(공지), 그 외(like·comment·song_complete·follow·credit_charged) → 음악.

**섹션 전체보기** — 허브 각 섹션 라벨 = `라벨 + Right-Line.svg(→)` 링크(둘러보기 패턴), 기본 노출 초과 시만 화살표. `HUB_LIMIT`: mine·popular·recent **6**, posts **9**. 전용 페이지 **`/community/list?type=popular|new|mine|posts`**(최대 100) + `/api/communities/list` + 서비스 `getCommunityList`. `getPopularPosts` 기본 limit **9**. 카드 공유 모듈 **`components/community/hubCards.tsx`**(CommunityCard·CommunityListRow·PopularPostCard). `/community/list`는 정적 세그먼트라 `[id]`와 충돌 없음.

**첨부곡 게시상태 픽스** — `SongEmbedCard.buildDetail` 공개곡 분기가 `published`·`publishComment`·`publishCoverImage` 누락 → 게시된 곡이 미게시로 열리던 버그 수정.

**프로필 이동** — 글 헤더·댓글의 이름·아바타 클릭 → `view-profile` 이벤트(layout이 `/profile/[username]` router.push). `CommunityPost.authorUsername` 추가(rowToPost 매핑, SELECT는 이미 username 조인).

**스낵바** — 글 게시/수정/삭제 시 toast. (음악은 기존부터 완비)

**콜드스타트 시드** — `scripts/seed-kpop-posts.mjs`·`fix-comment-count.mjs`(서비스롤키 하드코딩 → gitignore, 로컬 전용). "아이러브 K-POP"에 2026-07 K-POP 이슈 10글.
