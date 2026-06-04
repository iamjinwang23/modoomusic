# analytics-ga4 Planning Document

> **Summary**: GA4 통합 — 핵심 5~7개 비즈니스 이벤트 + 자동 page_view + user_id 매핑으로 추천 크리에이터 등 Plan SC 측정 인프라 구축
>
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-04
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 추천 크리에이터·둘러보기·만들기 등 핵심 플로우의 사용자 행동 데이터가 0. Plan SC("클릭율 8%+", "신규 팔로우 +30%", "cold start 단축")를 측정할 수단이 없음 |
| **Solution** | Google Analytics 4 통합 — `@next/third-parties/google`로 SPA 자동 추적 + 핵심 비즈니스 이벤트 5~7개 커스텀 wiring + 로그인 user_id 매핑으로 cross-device retention 추적 |
| **Function/UX Effect** | 사용자 무영향(투명). 운영 측: 퍼널·코호트·획득 채널·디바이스·실시간 활동 가시화. 추천 섹션 bucket별 클릭율 분리 측정 |
| **Core Value** | 데이터 기반 의사결정 인프라. "감"으로 만들던 우선순위를 정량 지표로 정렬. 출시한 추천 크리에이터 효과를 4주 후 측정해 다음 PDCA 사이클 의사결정에 활용 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | Plan SC 측정 불가 — 출시한 기능이 잘 되는지 모르고, 다음 우선순위도 감으로 정해야 함 |
| **WHO** | 운영자(분석 소비자), 모든 사용자(투명 추적 대상, GA4 동의 후 한정) |
| **RISK** | 행태정보 수집 동의(K-PIPA) 누락 시 위법 / adblocker 누수 ~20% / dev 환경 오염 |
| **SUCCESS** | DebugView에 핵심 이벤트 5종 흐름 확인, 출시 1주 후 일별 활성 사용자 수치 안정 수집, user_id 기준 코호트 그래프 생성 가능 |
| **SCOPE** | property 생성 가이드 / `@next/third-parties` wiring / 자동 page_view / 커스텀 이벤트 5~7개 / user_id 매핑 / privacy·OAuth 동의 텍스트 업데이트 |

---

## 1. Overview

### 1.1 Purpose

추천 크리에이터·둘러보기·만들기·팔로우 등 핵심 사용자 행동을 측정해 Plan SC를 정량 검증하고, 다음 기능 우선순위 결정을 데이터로 뒷받침한다.

### 1.2 Background

- **현재 상태**: 분석 도구 0개. 트래픽·전환·retention 모두 불가시
- **계기**: 추천 크리에이터 출시 직후. 4주 후 "클릭율 8%+", "신규 팔로우 +30%" 측정 필요
- **선택 이유 (GA4)**:
  - Next.js 통합 1줄 (`@next/third-parties`)
  - 무료, BigQuery export 가능
  - cross-device·session·funnel·cohort 표준 리포트
  - Firebase Analytics는 사실상 GA4로 흡수됨 + 다른 Firebase 서비스 미사용 → Firebase 도입 명분 약함
- **타이밍**: 추천 크리에이터 출시 직후 → baseline 측정 가능

### 1.3 Related Documents

- 추천 크리에이터 Plan: `docs/01-plan/features/recommended-creators.plan.md` (측정 대상 SC 보유)
- Privacy 페이지: `app/(legal)/privacy/` (업데이트 대상)
- Terms 페이지: `app/(legal)/terms/` (참조)

---

## 2. Scope

### 2.1 In Scope

- [ ] GA4 property 생성 가이드 (사용자 직접 수행 절차 문서화)
- [ ] `@next/third-parties/google` 통합 (`<GoogleAnalytics />` 전역)
- [ ] 자동 page_view (SPA 라우팅 자동 감지)
- [ ] 핵심 커스텀 이벤트 5~7개 wiring:
  - `sign_up` — 회원가입 (provider: kakao/google/naver/apple/email)
  - `login` — 로그인 (provider)
  - `song_generate` — 곡 생성 (genre, mood, mode: simple/detail)
  - `song_publish` — 곡 게시 (has_cover, comment_length)
  - `creator_follow` — 팔로우 (source: profile/recommended/song_detail, target_user_id)
  - `recommended_creator_click` — 추천 카드 클릭 (bucket: 1/2/3, position)
  - `song_play` — 곡 재생 시작 (origin: explore/library/profile)
- [ ] 로그인 사용자 user_id (Supabase UUID) GA4 user_id로 전송
- [ ] `NEXT_PUBLIC_GA_ID` 환경변수 — Vercel prod·preview·dev 설정
- [ ] dev 환경 자동 비활성 (오염 방지)
- [ ] Privacy 페이지에 "Google Analytics 행태정보 수집" 항목 추가

### 2.2 Out of Scope

- Cookie consent banner (EU 미타겟, K-PIPA는 privacy 명시로 충분)
- 기존 가입 사용자에게 동의 재취득 모달 (마찰 큼)
- Vercel Analytics·PostHog·Mixpanel (별도 PDCA)
- BigQuery export 셋업 (Phase 2)
- Server-side Measurement Protocol (현재 클라이언트 측정만으로 SC 검증 충분)
- Conversion API 연동
- A/B testing 통합 (별도 도구)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | GA4 measurement ID를 `NEXT_PUBLIC_GA_ID` 환경변수로 주입 | High | Pending |
| FR-02 | `<GoogleAnalytics />` 전역 컴포넌트가 모든 페이지에서 SPA page_view 자동 발생 | High | Pending |
| FR-03 | 회원가입·로그인 성공 시점에 `sign_up`/`login` 이벤트 발송 (provider 포함) | High | Pending |
| FR-04 | 곡 생성 성공 시 `song_generate` 이벤트 발송 (genre/mood/mode) | High | Pending |
| FR-05 | 곡 게시 성공 시 `song_publish` 이벤트 발송 | High | Pending |
| FR-06 | 팔로우 성공 시 `creator_follow` 이벤트 발송 (source 파라미터로 출처 구분) | High | Pending |
| FR-07 | 추천 크리에이터 카드 클릭 시 `recommended_creator_click` 이벤트 발송 (bucket·position) | High | Pending |
| FR-08 | 곡 재생 시작 시 `song_play` 이벤트 발송 (origin) | Medium | Pending |
| FR-09 | 로그인 사용자 GA4 `user_id` = Supabase user.id 설정 | High | Pending |
| FR-10 | 로그아웃 시 `user_id` 초기화 | Medium | Pending |
| FR-11 | dev 환경에서 GA4 비활성 (`NEXT_PUBLIC_GA_ID` 없으면 자동 비활성) | High | Pending |
| FR-12 | Privacy 페이지에 GA4 항목 추가 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | GA4 스크립트가 LCP·FID에 영향 없을 것 (async + next/third-parties) | Vercel Speed Insights 또는 Lighthouse |
| Privacy | user_id에 개인정보 포함 금지 (Supabase UUID만 사용) | 코드 리뷰 |
| Compliance | 개인정보 처리방침에 GA4 수집 항목·보존 기간(2년)·제3자(Google) 명시 | 변호사 검토(옵션) |
| Reliability | 이벤트 발송 실패가 사용자 액션을 막지 않을 것 (fire-and-forget) | 코드 패턴 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] GA4 property 생성·measurement ID 발급 완료
- [ ] `<GoogleAnalytics />` prod 환경에 적용
- [ ] 커스텀 이벤트 5~7개 모두 wire 완료
- [ ] DebugView에서 7종 이벤트 모두 발사 확인 (sign_up, login, song_generate, song_publish, creator_follow, recommended_creator_click, song_play)
- [ ] 로그인 사용자에 user_id 설정 확인 (GA4 user explorer)
- [ ] Privacy 페이지 GA4 항목 배포
- [ ] dev 환경 비활성 확인

### 4.2 Quality Criteria

- [ ] 이벤트 실패가 사용자 액션을 막지 않음 (try/catch 또는 fire-and-forget)
- [ ] LCP·CLS·INP 회귀 없음 (Lighthouse 비교)
- [ ] adblocker 환경에서도 사이트 정상 작동
- [ ] 빌드·lint·type-check 통과

### 4.3 Outcome Criteria (출시 1~4주 후 측정)

- [ ] DAU·WAU 일관 수집 (>= 95% 일자 데이터 존재)
- [ ] 추천 크리에이터 클릭율 8%+ 추적 가능 (Plan SC)
- [ ] 신규 팔로우 +30% 추적 가능 (Plan SC)
- [ ] D1/D7 retention 코호트 그래프 생성 가능

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| K-PIPA 동의 미흡으로 위법 | High | Low | Privacy 페이지에 명시 + 기존 OAuth 약관 동의에 포함되도록 텍스트 업데이트 |
| GA4 스크립트가 LCP 회귀 | Medium | Low | `@next/third-parties` 사용 (async·defer 기본) |
| dev 환경 데이터 오염 | Medium | Medium | `NEXT_PUBLIC_GA_ID` env 미주입 시 비활성 |
| 이벤트 발송 실패가 사용자 액션 차단 | High | Low | 모든 호출 fire-and-forget, await 금지 |
| adblocker로 데이터 누수 ~20% | Low | High | 절대값 아닌 상대 비교(전·후)로만 해석. 수치 해석 시 주의 |
| user_id에 PII 포함 실수 | High | Low | Supabase UUID만 사용. 이메일·username 절대 금지. 코드 리뷰 |
| 이벤트명 변경 시 데이터 단절 | Medium | Low | 이벤트명 상수 파일(`utils/analytics.ts`)로 중앙 관리, 변경 시 GA4 conversion 마이그레이션 필요 인지 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `app/layout.tsx` | Component | `<GoogleAnalytics />` 추가 |
| `app/(legal)/privacy/` | Content | GA4 수집 항목 조항 추가 |
| 회원가입·로그인 핸들러 | Hook | 성공 시점에 이벤트 발송 추가 |
| 곡 생성·게시 핸들러 | Service/Hook | 성공 시점에 이벤트 발송 추가 |
| 팔로우 토글 (useOptimisticToggle 호출처) | Component | source 컨텍스트와 함께 이벤트 발송 |
| `RecommendedCreators.tsx` | Component | 카드 클릭 시 bucket·position 이벤트 |
| `AuthProvider` | Component | user 변경 시 GA4 user_id set/clear |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `app/layout.tsx` | render | 모든 페이지 SSR/CSR | None — 컴포넌트만 추가 |
| AuthProvider | onAuthStateChange | 모든 로그인/아웃 이벤트 | None — side effect 추가 |
| `services/song.service.ts` | generate | SongForm·MyWorkPanel | None — wrap만 |
| `useOptimisticToggle` fetcher | follow | ProfilePanel·RecommendedCreators·SongDetailPage | None — wrap만 |

### 6.3 Verification

- [ ] 모든 wiring 지점에서 try/catch로 감싸 사용자 액션 차단 방지
- [ ] env 미주입 시 `<GoogleAnalytics />` no-op 동작 확인
- [ ] 비로그인 사용자에 대해 user_id 누락(자동 빈값) 확인

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | Feature 모듈, BaaS 통합 | 본 프로젝트 | ☑ |
| **Enterprise** | DI·마이크로서비스 | 대규모 | ☐ |

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Integration package | `@next/third-parties/google` / 수동 gtag | `@next/third-parties/google` | Next.js 공식, SSR 안전, async 자동 |
| 이벤트 발송 헬퍼 | inline gtag / 중앙 wrapper | `utils/analytics.ts` 중앙 wrapper | 이벤트명·파라미터 상수 관리, env 미주입 시 no-op |
| user_id 매핑 시점 | layout / AuthProvider | AuthProvider useEffect | 인증 상태 변경 시점에 자동 sync |
| dev 환경 처리 | flag / env 부재 | `NEXT_PUBLIC_GA_ID` 부재 시 비활성 | 추가 설정 없이 안전 |
| 이벤트 정의 위치 | per-feature / 중앙 enum | `utils/analytics.ts` constant | 검색·변경 용이 |
| 실패 처리 | throw / silent | silent (fire-and-forget) | UX 우선 |

### 7.3 Folder Structure Preview

```
utils/
  analytics.ts              # NEW — gtag wrapper + event 상수 + user_id set/clear

app/
  layout.tsx                # MODIFIED — <GoogleAnalytics /> 추가
  (legal)/privacy/page.tsx  # MODIFIED — GA4 항목 추가

components/
  AuthProvider.tsx          # MODIFIED — user 변경 시 setUserId

(각 wiring 지점)             # MODIFIED — utils/analytics.ts 호출
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` 존재 (Next.js 16 변경 사항 주의)
- [x] TypeScript strict
- [x] Tailwind v4
- [x] Supabase auth via SSR cookies

### 8.2 Conventions to Define

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 이벤트명 규칙 | missing | snake_case, 동사+명사 (`song_generate`) | High |
| 파라미터명 규칙 | missing | snake_case, 1~3 단어 | Medium |
| 호출 패턴 | missing | `analytics.track('event', { params })` fire-and-forget | High |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `NEXT_PUBLIC_GA_ID` | GA4 Measurement ID (G-XXXXXXX) | Client | ☑ |

---

## 9. GA4 Property 생성 절차 (사용자 직접 수행)

> Plan 단계 산출물 — Do 단계 진입 전에 사용자가 완료해야 환경변수 주입 가능

1. **Google Analytics 접속**: https://analytics.google.com → "측정 시작"
2. **계정 생성** (이미 있으면 skip): 계정 이름 = "MONO", 데이터 공유 옵션 기본값
3. **속성(Property) 생성**:
   - 속성 이름 = "MONO Production"
   - 보고 시간대 = 대한민국
   - 통화 = 대한민국 원
4. **비즈니스 세부정보**: 업종 = "예술, 엔터테인먼트", 크기 = 소
5. **비즈니스 목표**: "유저 행동 검토" + "리드 생성" 선택
6. **데이터 스트림 생성**:
   - 플랫폼 = 웹
   - URL = `https://modoomusic.com`
   - 스트림 이름 = "MONO Web"
   - **향상된 측정 = 켜기** (자동 scroll·outbound click·search 등)
7. **Measurement ID 복사**: `G-XXXXXXXXXX` 형태 → Vercel 환경변수에 저장
8. **DebugView 활성화 준비**: Property 설정 → "디버그 뷰" 메뉴 확인
9. (옵션) **데이터 보존 기간 변경**: 기본 2개월 → 14개월 권장 (Admin → Data Settings → Data Retention)

---

## 10. Vercel 환경변수 설정 절차

```bash
# Vercel CLI (또는 Dashboard → Project Settings → Environment Variables)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Scope:
#   - Production: ✅ (실제 GA4 ID)
#   - Preview: ❌ (또는 별도 dev property)
#   - Development: ❌ (로컬 비활성)
```

dev 환경에서 활성화하고 싶으면 `.env.local`에 별도 property ID 주입 가능 (오염 주의).

---

## 11. Next Steps

1. [ ] 사용자: GA4 property 생성 + Measurement ID 발급
2. [ ] 사용자: Vercel 환경변수 `NEXT_PUBLIC_GA_ID` 설정 (Production만)
3. [ ] `/pdca design analytics-ga4` → 구체적 모듈 분할 + wiring 지점 코드 위치
4. [ ] `/pdca do analytics-ga4` → 구현
5. [ ] DebugView에서 7종 이벤트 검증
6. [ ] 출시 1주 후 데이터 수집 안정성 확인
7. [ ] 출시 4주 후 추천 크리에이터 SC 정량 검증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-04 | Initial draft (요구사항 확정 후 4 결정 반영) | iamjinwang@gmail.com |
