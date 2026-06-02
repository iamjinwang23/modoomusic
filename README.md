# 모두의 노래 (MONO)

> AI 음악 크리에이티브 플랫폼 — 한 줄 설명만으로 누구나 자신만의 음악을 만들 수 있는 한국 서비스

**프로덕션**: https://modoomusic.com
**운영 주체**: 주식회사 비누컴퍼니
**문의**: bee202408@gmail.com

---

## 한 줄 요약

음악 경험 없는 사용자가 한 줄 설명으로 보컬·연주·가사·커버까지 한 번에 만들 수 있는 **무료 우선 AI 음악 생성·발행 SNS**.

## 핵심 기능

### 생성
- **심플 모드** — 설명 한 줄 + 인스트루멘탈 토글만으로 자동작사·작곡·커버
- **고급 모드** — 스타일·가사·인스트루멘탈·커버 직접 편집
- **AI 가사 생성** — MiniMax 전용 `lyrics_generation` 엔드포인트로 구조 태그 포함 가사 생성 (크레딧 미소모)
- **백그라운드 생성** (Suno parity) — INSERT 직후 반환 후 Vercel `after()`로 비동기 처리, Supabase Realtime으로 완료 알림
- MiniMax Music 2.0 / 2.5+ / 2.6 / 2.6-free 모델 지원, 인스트루멘탈은 2.6 자동 전환

### 게시·소셜
- 공개 게시 → 탐색 피드 (에디터 추천 = likes×3+plays, 새로운 음악)
- 좋아요·팔로우·**댓글(1단계 대댓글)**·공유 deep link (`?song={id}`)
- **댓글 시스템** — 이모지 핫키, 게시자 배지, 좋아요(빨강 하트), 신고(8 사유), 편집/삭제, 500자 제한 + 10줄+ 더보기/접기
- 컬렉션 (개인 책갈피)
- 알림 5종 (`like`/`song_complete`/`system`/`follow`/`comment`) + 자동 정리 cron

### 인증·운영
- Google·Kakao·**Apple**·**Naver** OAuth (Apple은 Service ID 기반 JWT secret 6개월 회전)
- 4단계 온보딩 (랜덤 username + display_name)
- 프로필: 아바타·커버·bio·SNS 5종, 아이디 1회·이름 14일 2회 변경 정책
- 일일 크레딧 차감·KST 자정 리셋·모델 잠금
- 약관·개인정보처리방침·운영정책 페이지

### 검색·SEO
- Google Search Console + Naver Search Advisor 등록 완료 (DNS TXT / HTML 파일 verify)
- OpenGraph·Twitter Card·JSON-LD(`Organization`+`WebSite`+`WebApplication`)
- 동적 sitemap·robots
- 512×512 검색 favicon + 1200×630 OG 이미지

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 16.2.6 (App Router + Turbopack) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS |
| 폰트 | Plus Jakarta Sans (영) + Pretendard (한) |
| DB·인증·스토리지 | Supabase (PostgreSQL + Storage + Realtime + RLS) |
| AI | MiniMax Music API (2.0/2.5+/2.6/2.6-free) + Lyrics Generation API |
| 배포 | Vercel (Hobby) — `modoomusic.com` (canonical non-www) |
| DNS | AWS Route 53 |
| 크론 | Vercel Cron (알림 정리·태그 백필) |

## 아키텍처 결정

- **App Router + `(main)` route group** — 영구 shell 분리로 페이지 이동에도 헤더·미니바·토스트 유지
- **모달 responsive** — 모바일 바텀시트, 데스크톱 중앙
- **데스크톱 좌측 사이드바 / 모바일 BottomNav 5탭** (탐색·라이브러리·만들기·알림·프로필)
- **곡 상세는 shell의 song overlay state** (URL 변경 없음, `?song=` 쿼리는 deep link 진입 전용)
- **백그라운드 생성** — `/api/generate`가 status=generating으로 INSERT 후 즉시 반환, `after()`로 MiniMax 호출. SongRealtimeBridge가 UPDATE 구독 → 캐시 patch + 토스트
- **admin client 분리** — `lib/supabase/server.ts`는 user JWT 컨텍스트(RLS 적용), `lib/supabase/admin.ts`는 service_role(RLS 우회). cookies 있는 createClient는 admin이 아니므로 정확히 구분 필요
- **트리거 `SECURITY DEFINER`** — 다른 사용자 row를 UPDATE하는 트리거(좋아요·댓글 카운트 등)는 RLS 우회 위해 정의자 권한 필수
- **denormalized counts** — `songs.like_count`, `songs.comment_count`, `comments.like_count`를 트리거로 동기화

## 디렉토리 구조 (요약)

```
app/                  Next.js App Router (route groups: (main), (legal))
  api/                서버 라우트 (생성·인증·결제 콜백·cron 등)
  layout.tsx          전역 메타·SEO·폰트
  robots.ts           동적 robots.txt
  sitemap.ts          동적 sitemap.xml
components/           공용 컴포넌트 (Comment*·SongDetailPage·NotificationItem 등)
features/             도메인별 컴포넌트
  song/               MyWorkPanel, SongForm, MyCollectionPanel
  explore/            ExplorePanel, ProfilePanel, PublicSongCard
contexts/             GlobalPlayerContext
hooks/                useOptimisticToggle 등
services/             song / comment / explore / minimax / lyrics / notification / collection / credit
lib/supabase/         server·admin·browser 클라이언트
utils/                profileColor, extractTags, shareUrl 등
supabase/migrations/  SQL 마이그레이션 (수동 SQL Editor 적용)
public/               정적 자산 (아이콘·로고·OG·verify HTML)
docs/                 PDCA 산출물 (plan/design/analysis/report)
```

## 개발 환경 셋업

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정 — .env.local
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
# MINIMAX_API_KEY, MINIMAX_GROUP_ID
# APPLE_*, NAVER_*, GOOGLE_* OAuth 키
# CRON_SECRET
# GOOGLE_SITE_VERIFICATION, NAVER_SITE_VERIFICATION (선택)

# 3. 개발 서버
npm run dev
# http://localhost:3000

# 4. 타입 체크
npx tsc --noEmit

# 5. 빌드 (배포 전 검증)
npm run build
```

> **마이그레이션 주의**: Supabase MCP 권한 부족으로 `supabase/migrations/*.sql`은 **수동으로 SQL Editor에서 적용**. repo 파일과 원격 DB는 drift 가능 — 트리거 변경 시 특히 주의.

## 운영 메모

- **Apple Sign In Secret 만료**: 2026-11-27 경 — `gen_apple_secret.js`로 재발급 후 Supabase Apple Secret Key에 붙여넣기
- **마이그레이션 017** (`songs.comment_count`) 수동 SQL Editor 적용 예정
- Vercel "DNS Change Recommended" 노란 뱃지 — 권장 DNS 적용 권장 (선택)
- Naver 검색 색인 1주~수개월 / Google 며칠~몇 주 소요

## 문서

PDCA(Plan → Design → Do → Check → Act) 산출물은 `docs/`에:

- `docs/00-pm/` — PRD (필요 시)
- `docs/01-plan/features/` — Plan 문서
- `docs/02-design/features/` — Design 문서
- `docs/03-analysis/` — Gap 분석
- `docs/04-report/` — 완료 보고서
- `docs/archive/YYYY-MM/` — 완료 feature 보관소

주요 plan 문서:
- `today-song-mvp.plan.md` — 1차 MVP 전체 스코프
- `comments.plan.md` — 댓글 시스템
- `ai-lyrics-gen.plan.md` — AI 가사 생성
- `simple-mode.plan.md` — Suno식 심플 모드
- `mobile-optimization.plan.md` — 모바일 전환
- `legal-pages.plan.md` — 약관·정책 페이지
- `supabase-infra.plan.md` — Supabase 인프라

## 라이선스 / 저작권

© 2026 주식회사 비누컴퍼니 (BeeNoo Company). All rights reserved.

서비스 콘텐츠의 저작권은 각 창작자(사용자)에게 귀속합니다. 약관·개인정보처리방침은 [/terms](https://modoomusic.com/terms) · [/privacy](https://modoomusic.com/privacy) · [/policy](https://modoomusic.com/policy) 참조.
