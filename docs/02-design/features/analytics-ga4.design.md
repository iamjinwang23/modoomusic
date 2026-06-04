# analytics-ga4 Design Document

> **Architecture**: Option C — Pragmatic Balance
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-04
> **Status**: Draft
> **Plan Ref**: `docs/01-plan/features/analytics-ga4.plan.md`

---

## Context Anchor

> Copied from Plan §Context Anchor. Propagates to Do/Check.

| Key | Value |
|-----|-------|
| **WHY** | Plan SC 측정 불가 — 출시 효과를 모르고, 다음 우선순위도 감으로 |
| **WHO** | 운영자, 모든 사용자(투명 추적) |
| **RISK** | K-PIPA 동의 누락 / adblocker 누수 / dev 오염 / PII 실수 |
| **SUCCESS** | DebugView 5~7종 이벤트 확인 + 1주 후 안정 수집 + 코호트 그래프 |
| **SCOPE** | property 가이드 / wiring / 자동 page_view / 7 이벤트 / user_id / privacy 업데이트 |

---

## 1. Overview

GA4 통합을 단일 `utils/analytics.ts` wrapper로 구현. `@next/third-parties/google`로 SPA 자동 추적 + 7개 핵심 비즈니스 이벤트 wiring + AuthProvider에서 user_id 자동 sync. env 미주입 시 모든 호출 no-op.

---

## 2. Architecture (Option C)

```
┌───────────────────────────────────────────────────────────────┐
│ app/layout.tsx                                                │
│   <GoogleAnalytics gaId={NEXT_PUBLIC_GA_ID} />  ← 한 줄       │
└───────────────────────────────────────────────────────────────┘
           │ (자동 page_view 발사)
           ↓
┌───────────────────────────────────────────────────────────────┐
│ utils/analytics.ts (NEW, 단일 파일)                           │
│   • EVENTS = { SIGN_UP, LOGIN, SONG_GENERATE, … } as const    │
│   • track(event, params)  ← env 없으면 no-op, try/catch       │
│   • setUserId(id) / clearUserId()                             │
└───────────────────────────────────────────────────────────────┘
           ↑                              ↑
           │ side-effect call             │ user_id sync
┌──────────────────────┐      ┌──────────────────────────────┐
│ 7개 wiring 지점       │      │ components/AuthProvider.tsx │
│  - AuthProvider      │      │   useEffect → setUserId      │
│  - SongForm          │      │     / clearUserId            │
│  - PublishModal      │      └──────────────────────────────┘
│  - ProfilePanel      │
│  - RecommendedCreators│
│  - SongDetailPage    │
│  - PublicSongCard    │
└──────────────────────┘
```

---

## 3. Data Model

**마이그레이션 없음.** GA4는 외부 서비스, DB 변경 0.

### 3.1 Event Constant 정의

```ts
// utils/analytics.ts
export const EVENTS = {
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  SONG_GENERATE: 'song_generate',
  SONG_PUBLISH: 'song_publish',
  CREATOR_FOLLOW: 'creator_follow',
  RECOMMENDED_CREATOR_CLICK: 'recommended_creator_click',
  SONG_PLAY: 'song_play',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
```

### 3.2 Event Parameters (Type Map)

| Event | Parameters |
|---|---|
| `sign_up` | `{ provider: 'kakao' \| 'google' \| 'naver' \| 'apple' \| 'email' }` |
| `login` | `{ provider: 'kakao' \| 'google' \| 'naver' \| 'apple' \| 'email' }` |
| `song_generate` | `{ genre?: string, mood?: string, mode: 'simple' \| 'detail' }` |
| `song_publish` | `{ has_cover: boolean, comment_length: number }` |
| `creator_follow` | `{ source: 'profile' \| 'recommended' \| 'song_detail', target_user_id: string }` |
| `recommended_creator_click` | `{ bucket: 1 \| 2 \| 3, position: number, target_user_id: string }` |
| `song_play` | `{ origin: 'explore' \| 'library' \| 'profile' \| 'song_detail', song_id: string }` |

---

## 4. API Contract

해당 없음 (외부 GA4 endpoint, gtag.js가 처리).

### 4.1 Public API of `utils/analytics.ts`

```ts
// 환경변수 미주입 시 모두 no-op
export function track<E extends EventName>(event: E, params?: Record<string, unknown>): void

export function setUserId(userId: string): void

export function clearUserId(): void

// SPA 보조 (next/third-parties가 기본 자동이지만 수동 호출용)
export function trackPageView(path: string): void
```

---

## 5. UI / Component

UI 변경 없음 (헤드리스 분석). 단, **개인정보 처리방침 페이지**에 GA4 항목 추가.

### 5.1 Privacy 페이지 업데이트 텍스트 (drafted)

```
3. 자동 수집 항목 (Google Analytics 4)
- 수집 항목: 페이지 방문 기록, 클릭·재생·게시 등 행동 이벤트, 디바이스 정보(브라우저·OS), 대략적 위치(국가 단위), 익명 사용자 ID(쿠키 `_ga`, `_ga_<id>`)
- 수집 목적: 서비스 이용 패턴 분석, 기능 개선, 추천 알고리즘 최적화
- 보존 기간: 14개월 (Google Analytics 데이터 보존 정책)
- 제3자 제공: Google LLC (Google Analytics 운영)
- 거부 방법: 브라우저 GA Opt-out Add-on (https://tools.google.com/dlpage/gaoptout) 또는 광고 차단기 사용
```

---

## 6. State Management

`utils/analytics.ts`는 stateless. 유일한 "상태"는 `gtag('set', { user_id })` 호출 — gtag 내부 dataLayer에서 유지. React state 없음.

AuthProvider에서 user 변경 감지:
```ts
useEffect(() => {
  if (user) setUserId(user.id)
  else clearUserId()
}, [user?.id])
```

---

## 7. Implementation Details

### 7.1 `utils/analytics.ts` 전체 구현

```ts
// Design Ref: analytics-ga4 §2 — Option C 중앙 wrapper
// env 미주입 시 no-op. 모든 호출 try/catch로 감싸 사용자 액션 차단 금지.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID
const isEnabled = (): boolean => Boolean(GA_ID) && typeof window !== 'undefined' && typeof window.gtag === 'function'

export const EVENTS = {
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  SONG_GENERATE: 'song_generate',
  SONG_PUBLISH: 'song_publish',
  CREATOR_FOLLOW: 'creator_follow',
  RECOMMENDED_CREATOR_CLICK: 'recommended_creator_click',
  SONG_PLAY: 'song_play',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

export function track(event: EventName, params: Record<string, unknown> = {}): void {
  if (!isEnabled()) return
  try {
    window.gtag!('event', event, params)
  } catch (e) {
    console.warn('[analytics.track]', event, e)
  }
}

export function setUserId(userId: string): void {
  if (!isEnabled()) return
  try {
    window.gtag!('set', { user_id: userId })
  } catch (e) {
    console.warn('[analytics.setUserId]', e)
  }
}

export function clearUserId(): void {
  if (!isEnabled()) return
  try {
    window.gtag!('set', { user_id: null })
  } catch (e) {
    console.warn('[analytics.clearUserId]', e)
  }
}

export function trackPageView(path: string): void {
  if (!isEnabled() || !GA_ID) return
  try {
    window.gtag!('config', GA_ID, { page_path: path })
  } catch (e) {
    console.warn('[analytics.trackPageView]', e)
  }
}
```

### 7.2 `app/layout.tsx` 패치

```tsx
import { GoogleAnalytics } from '@next/third-parties/google'
...
return (
  <html lang="ko">
    <body>{children}</body>
    {process.env.NEXT_PUBLIC_GA_ID && (
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
    )}
  </html>
)
```

조건부 렌더 → env 없으면 스크립트 자체 미주입.

### 7.3 7개 wiring 지점 — 정확한 위치

| Event | 호출 위치 | 트리거 |
|---|---|---|
| `sign_up` | `components/AuthProvider.tsx` onAuthStateChange (event === 'SIGNED_UP' 또는 신규 user 감지) | 가입 직후 |
| `login` | 동일 (event === 'SIGNED_IN' && !isNew) | 로그인 직후 |
| `song_generate` | `features/song/components/SongForm.tsx` 또는 `services/song.service.ts` generate 호출처 | API 성공 응답 시 |
| `song_publish` | `features/song/components/PublishModal.tsx` 게시 성공 시 | DB upsert 성공 |
| `creator_follow` | `useOptimisticToggle` fetcher 성공 시 — `ProfilePanel`·`RecommendedCreators`·`SongDetailPage` 3곳에서 source 파라미터 전달 | API 성공 |
| `recommended_creator_click` | `features/explore/components/RecommendedCreators.tsx` `openProfile()` | 아바타/이름 클릭 |
| `song_play` | `view-song` 또는 `play-song` 이벤트 listener (`app/(main)/layout.tsx`?) | 재생 시작 |

### 7.4 AuthProvider 통합

```tsx
// components/AuthProvider.tsx
import { track, setUserId, clearUserId, EVENTS } from '@/utils/analytics'

useEffect(() => {
  if (user) {
    setUserId(user.id)
  } else {
    clearUserId()
  }
}, [user?.id])

// onAuthStateChange 안에서:
//   event === 'SIGNED_IN' → track(EVENTS.LOGIN, { provider })
//   첫 가입 감지 → track(EVENTS.SIGN_UP, { provider })
```

provider 추출은 user.app_metadata.provider (Supabase 표준 필드).

### 7.5 dev 환경 처리

- `.env.local`에 `NEXT_PUBLIC_GA_ID` 미주입 → `isEnabled()` false → 모든 호출 no-op
- Vercel Preview/Production만 환경변수 설정
- 로컬에서 GA4 dev property로 테스트하고 싶으면 별도 measurement ID `.env.local`에 주입

---

## 8. Test Plan

### 8.1 수동 검증 체크리스트

- [ ] env 없이 로컬 실행 → 모든 액션 정상, 콘솔에 warning 없음
- [ ] env 주입 후 로컬 실행 → Network에 collect 요청 발생, GA4 DebugView에 이벤트 실시간 도착
- [ ] sign_up: 신규 카카오 가입 → DebugView에서 `sign_up { provider: 'kakao' }` 확인
- [ ] login: 동일 계정 재로그인 → `login` 이벤트 확인
- [ ] song_generate: 곡 생성 → genre/mood/mode 파라미터 확인
- [ ] song_publish: 게시 → has_cover/comment_length 확인
- [ ] creator_follow: 3개 source(profile/recommended/song_detail) 각각 발사 확인
- [ ] recommended_creator_click: bucket 1/2/3 모두 케이스 확인
- [ ] song_play: 4개 origin 모두 케이스 확인
- [ ] user_id: 로그인 후 GA4 User Explorer에서 user_id로 검색 가능 확인
- [ ] clearUserId: 로그아웃 후 user_id null 처리 확인
- [ ] LCP 회귀 없음 (Lighthouse 전·후 비교)

### 8.2 PII 안전성 검증

- [ ] 모든 event params 검토 — 이메일·실명·전화번호 등 PII 0건
- [ ] user_id = Supabase UUID만, 절대 이메일·username 금지
- [ ] target_user_id 등 ID 파라미터도 UUID만

---

## 9. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| AuthProvider `event === 'SIGNED_UP'`이 Supabase에서 별도 emit 안 됨 | onAuthStateChange의 `event` 종류 확인 — 'SIGNED_IN' 직후 created_at 비교로 신규 판별 (created_at < 60초) |
| Vercel env 누락 시 prod 전체 비활성 | 배포 후 즉시 DebugView 확인 체크리스트에 포함 |
| user_id가 GDPR 측면에서 PII로 분류될 수 있음 | Supabase UUID는 비식별. 단, GA4 user-id feature는 explicit consent 권장 — 향후 OAuth 약관 텍스트 검토 필요 |
| song_play 이벤트가 너무 자주 발사 (이벤트 폭주) | 재생 시작 시 1회만 (progress·complete는 추적 안 함). 한 세션 같은 곡 재생도 매번 발사하되 GA4 unique event 집계가 적절 처리 |

---

## 10. Decision Records (10)

| # | 결정 | 근거 |
|---|---|---|
| 1 | Option C 단일 `utils/analytics.ts` | 7 이벤트 규모에 B는 과잉, A는 env 분기 반복 |
| 2 | `@next/third-parties/google` 사용 | Next.js 공식, async/defer 자동, SSR 안전 |
| 3 | env 부재 시 no-op | dev 환경 오염·미설정 prod 안전 동시 해결 |
| 4 | 모든 호출 try/catch | adblocker·gtag undef 케이스에 UX 차단 방지 |
| 5 | `EVENTS` const enum | typo 방지 + 검색 용이 + 이벤트명 마이그레이션 시 grep 1회 |
| 6 | user_id = Supabase UUID | 비식별 cross-device 추적, PII 0 |
| 7 | AuthProvider useEffect로 user_id sync | 단일 진입점, 로그아웃 자동 처리 |
| 8 | song_play 시작만 추적 | progress·complete는 GA4 cost·noise 증가, ROI 낮음 |
| 9 | source/origin 파라미터로 분기 추적 | 같은 이벤트 다른 출처를 GA4 secondary dimension으로 분리 분석 |
| 10 | `<GoogleAnalytics />` 조건부 렌더 | env 없으면 스크립트 미주입 → LCP 영향 0 |

---

## 11. Implementation Guide

### 11.1 모듈 분할

| Module | 파일 | 변경 |
|---|---|---|
| `module-deps` | `package.json` | `@next/third-parties` 추가 |
| `module-core` | `utils/analytics.ts` | **신규** (~80 lines) |
| `module-layout` | `app/layout.tsx` | `<GoogleAnalytics />` 조건부 렌더 추가 |
| `module-auth` | `components/AuthProvider.tsx` | user_id sync + sign_up/login 이벤트 |
| `module-song` | `features/song/components/SongForm.tsx`, `PublishModal.tsx` | song_generate, song_publish wiring |
| `module-follow` | `features/explore/components/ProfilePanel.tsx`, `RecommendedCreators.tsx`, `components/SongDetailPage.tsx` | creator_follow (3 source) |
| `module-explore` | `features/explore/components/RecommendedCreators.tsx` | recommended_creator_click |
| `module-play` | view-song/play-song listener 위치 (`app/(main)/layout.tsx` 등) | song_play wiring |
| `module-privacy` | `app/(legal)/privacy/page.tsx` | GA4 항목 추가 |
| `module-env` | `.env.example` 또는 README | `NEXT_PUBLIC_GA_ID` 문서화 |
| `module-qa` | (수동 QA) | DebugView 검증 |

### 11.2 구현 순서 (의존성)

1. `module-deps`: `npm i @next/third-parties` (~1분)
2. `module-core`: `utils/analytics.ts` (~10분)
3. `module-layout`: layout.tsx (~3분)
4. `module-auth`: AuthProvider — user_id + sign_up/login (~15분)
5. `module-song`, `module-follow`, `module-explore`, `module-play`: 병렬 wiring (~40분)
6. `module-privacy`: privacy 페이지 (~10분)
7. `module-env`: env 가이드 (~3분)
8. `module-qa`: 수동 검증 (~30분)

**총 예상**: ~2h

### 11.3 Session Guide

| Scope Key | 권장 묶음 | 예상 시간 |
|---|---|---|
| `module-core,module-layout,module-deps` | 인프라 셋업 | ~15분 |
| `module-auth` | 인증 이벤트 + user_id | ~15분 |
| `module-song,module-follow,module-explore,module-play` | wiring 일괄 | ~40분 |
| `module-privacy,module-env` | 마무리 | ~15분 |
| `module-qa` | 검증 | ~30분 |

**단일 세션 권장 (~2h)** 또는 2 세션 분할 가능 (인프라+인증 1h / wiring+마무리 1h).

---

## 12. Open Questions (Do 진입 전 확인)

1. **Supabase onAuthStateChange `event` 값** — Supabase JS v2에서 신규 가입 식별 방법 확인 필요 (created_at 비교 vs 별도 이벤트)
2. **provider 추출 위치** — `user.app_metadata.provider` 또는 `user.identities[0].provider` 중 안정적인 쪽
3. **song_play listener 정확한 위치** — view-song·play-song dispatch 받는 글로벌 위치 (현재 layout.tsx로 추정)
4. **GA4 property 생성·MeasurementID 발급 완료 여부** — Plan §9 절차 수행 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-04 | Initial draft, Option C selected | iamjinwang@gmail.com |
