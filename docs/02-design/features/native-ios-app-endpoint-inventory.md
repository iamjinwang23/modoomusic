# 네이티브 앱 — 읽기 엔드포인트 커버리지 전수조사 (Phase 1 T11)

> **목적:** RN 앱은 화면 데이터를 REST(BFF)로 받아야 한다. 현 웹이 (a) 이미 REST로 커버하는 화면과 (b) 서버컴포넌트/클라이언트 스토어로 렌더해 **신규 엔드포인트가 필요한** 화면을 구분해, Phase 2~8 착수 전 신설 대상을 확정한다.
> **조사일:** 2026-07-07. **결론:** 커뮤니티·액션류는 REST 완비. 피드/리스트/상세(홈·라이브러리·탐색·곡·프로필)는 신규 read 엔드포인트 필요.

## 1. 조사 방법
- `apps/web/app/api/**/route.ts` 전수 목록화(약 90개 라우트).
- 주요 화면(`page.tsx`) 렌더 방식 분류: client(REST 호출) / server 컴포넌트(직접 서비스·SQL) / client 스토어(`songService` 등).

## 2. 커버리지 요약

| 기능 영역 | 데이터 소스(현행) | RN 재사용 | 신규 엔드포인트 |
|---|---|---|---|
| **커뮤니티**(허브·상세·글·댓글·좋아요·투표·가입·폐쇄·내보내기) | **client 페이지 → REST** (`/api/communities/*`, `/api/community-posts/*`, `/api/community-comments/*`) | ✅ 그대로 | 없음 |
| **음악 생성·가사** | REST (`/api/generate`, `/api/lyrics`) | ✅ | 없음 |
| **곡 액션**(좋아요·재생·공유·신고·댓글·영상생성·상태) | REST (`/api/songs/[id]/*`) | ✅ | 없음 |
| **크레딧·결제·환불** | REST (`/api/credits/me`, `/api/payments/*`) | ✅(웹 PortOne, 앱은 IAP로 대체 — Phase3) | IAP 웹훅(별도) |
| **소셜**(팔로우·알림·푸시·추천크리에이터·검색·리퍼럴) | REST (`/api/profiles/[id]/follow`, `/api/notifications/*`, `/api/push/*`, `/api/explore/recommended-creators`, `/api/search`, `/api/referral/*`) | ✅ | 없음 |
| **홈/탐색 피드** | server 컴포넌트 + client `exploreService`(일부 REST) | 부분 | ⚠️ **피드 리스트 REST 신설** |
| **라이브러리(내 곡)** | client **`songService`(localStorage 스토어)** | ❌ | ⚠️ **`GET /api/songs/mine` 신설** |
| **곡 상세** | 라우트 페이지 없음(패널/모달) | ❌ | ⚠️ **`GET /api/songs/[id]`(상세) 신설** |
| **프로필** | server 컴포넌트 **직접 `.from('profiles')`** | ❌ | ⚠️ **`GET /api/profiles/[username]` 신설** |
| **관리자** | REST (`/api/admin/*`) 완비 | (앱 범위 외 가능) | 없음 |

## 3. 신규 엔드포인트 (Phase별 신설 대상)

- **Phase 2 (핵심 루프)**:
  - `GET /api/songs/mine` — 내 곡 리스트(상태·재생·게시). 현행 `songService`(localStorage) 대체. RN 라이브러리 필수.
  - `GET /api/songs/[id]` — 곡 상세(메타·좋아요·영상 상태). RN 상세 화면.
- **Phase 4 (탐색/프로필/소셜)**:
  - `GET /api/explore/feed` (또는 세분화된 피드 엔드포인트) — 홈/탐색 피드 리스트. 현행 server 컴포넌트 렌더 대체.
  - `GET /api/profiles/[username]` — 프로필 + 곡/컬렉션 탭 데이터. 현행 서버 직접 SQL 대체.
- **Phase 5 (커뮤니티)**: **신설 불요**(REST 완비).
- **Phase 6 (영상)**: 기존 `/api/songs/[id]/generate-video`·`/video-status` 재사용. 신설 불요.
- **Phase 7 (푸시)**: 기존 `/api/push/*` 재사용 + `push_subscriptions.platform` 확장(마이그레이션).

## 4. 원칙
- 신규 read 엔드포인트는 **기존 서비스 함수 재사용**(server 컴포넌트가 부르던 그 함수를 route.ts로 노출). 로직 중복 금지.
- 인증은 BFF Bearer 경로(§3, [[native-ios-app.design]])로 통일 — RN 토큰·웹 쿠키 동일 핸들러.
- 응답 셰이프는 `@mono/shared` 도메인 타입에 맞춤(웹/앱 계약 단일화).

## 5. 결론
Phase 2~8의 "최대 변수"였던 엔드포인트 갭이 **국지적**(내곡·곡상세·피드·프로필 4종)으로 확정됨. 커뮤니티는 완비라 Phase 5는 프론트만. 각 신설 엔드포인트는 해당 Phase 계획의 선행 Task로 편입한다.

## 6. 해소 현황 (2026-07-07, 구현 완료·배포)
4개 갭 전부 신설·배포 완료:
- ✅ `GET /api/songs/mine`, `GET /api/songs/[id]` — song-map.ts·song-query.service로 client/서버 공용.
- ✅ `GET /api/explore/feed?tab=recommended|latest|popular` — exploreService.getFeed 재사용.
- ✅ **프로필: `GET /api/explore/profile/[username]`** — ⚠️ 원안 `/api/profiles/[username]`은 기존 `/api/profiles/[id]/follow`와 **[id] 세그먼트 충돌**로 불가 → `explore/profile/[username]`로 신설. getProfile+getUserSongs, isFollowing은 authed 클라로 보정.
- ✅ `GET /api/notifications` — 추가 신설(알림 인박스, actor·song 조인).
전부 `createUserClient`(쿠키+Bearer)로 앱·웹 공용. 웹 기존 동작 무변경(additive).
