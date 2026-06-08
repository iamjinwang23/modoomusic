# referral Planning Document

> **Summary**: 친구 초대 시스템 — 결제 인프라 도입 전 단계에서 viral 사용자 획득. 초대자·가입자 둘 다 +10cr 보너스 (초대자 최대 10명까지)
>
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-08
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 결제 인프라 도입 전 단계에 광고 비용 부담 X / 일일 10cr만으론 헤비 사용자 onboarding 마찰 / 자연 유입 외 viral loop 없음 — 사용자 풀 확보에 한계 |
| **Solution** | 사용자별 unique referral code(8자) + 친구 가입 완료 시 초대자·가입자 둘 다 +10cr 보너스 크레딧. 보너스 크레딧은 일일 10cr와 별도 컬럼 + 이월 가능 + 소진 시 일일 크레딧 먼저 소비 |
| **Function/UX Effect** | 더보기 메뉴에 "친구 초대" → 모달(링크 복사 + Web Share API native share sheet). `?ref={code}` 쿼리가 OAuth callback까지 보존되어 가입 시점에 redeem |
| **Core Value** | CAC ≈ 0 viral 사용자 획득. 가입 1명당 비용 ~$2 (광고 CPI 1/3~1/5). 1차 무료 정책 강화 및 사용자 풀 확보 가속 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 결제 인프라 도입 전 마지막 viral 채널 — 사용자 풀 확보 우선 단계에 광고 없이 가능한 가장 강력한 도구 |
| **WHO** | 초대자(만족도 높은 active user), 신규 가입자(친구 추천으로 신뢰 확보된 유입) |
| **RISK** | 자기참조 abuse / 봇 가입 / MiniMax 호출 비용 폭증 / 기존 사용자 박탈감 |
| **SUCCESS** | 가입자 중 referral 경유 비율 20%+, 초대자 1인당 평균 2~3명 초대, 가입 직후 곡 생성율 50%+ (보너스 영향 검증) |
| **SCOPE** | DB 컬럼 4개 / referral_code 생성·검증 / redeem API / 더보기 모달 + 공유 / GA4 이벤트 / OAuth 흐름 통합 |

---

## 1. Overview

### 1.1 Purpose

결제 인프라가 없는 상태에서 viral loop를 통해 사용자 풀을 빠르게 확보한다. Dropbox·Cursor·Notion 패턴 차용.

### 1.2 Background

- **1차 Free Only 정책** 단계 — 사용자 풀이 KPI
- 추천 크리에이터·검색·GA4까지 발견·관계 인프라 완성
- 이제 "획득" 채널이 필요한 시점 → 광고 비용 0의 viral
- 결제 인프라 도입 전이라 "현금성 보상" 불가 → 내부 크레딧이 이상적

### 1.3 Related Documents

- 일일 크레딧 시스템: `services/credit.service.ts`
- 약관/개인정보처리방침: `app/(legal)/terms`·`privacy`·`policy`
- GA4 이벤트 인프라: `utils/analytics.ts`

---

## 2. Scope

### 2.1 In Scope

- [ ] DB 마이그레이션: `profiles.referral_code`(text, unique, 8자), `profiles.referred_by`(uuid, nullable), `profiles.referrer_bonus_count`(int, default 0), `profiles.bonus_credits`(int, default 0)
- [ ] 가입 시점에 `referral_code` 자동 생성 (8자 alphanumeric, 충돌 시 재시도)
- [ ] 가입자가 `?ref={code}` 쿼리 들고 OAuth 진입 → sessionStorage·쿠키 보존 → 가입 완료 시점에 redeem
- [ ] Redeem API (`POST /api/referral/redeem`): 코드 검증, anti-abuse 체크, 양쪽 +10cr, 카운터 +1
- [ ] **보너스 크레딧 소진 우선** — `credit.service.consume`이 보너스 → 일일 순서로 차감
- [ ] **상한 적용**: 초대자 누적 10명까지만 보상 (그 이후는 카운터만 증가, 보너스 X — 자랑용)
- [ ] 더보기 메뉴 → "친구 초대" 항목 (현재 "자주 묻는 질문" 위쪽)
- [ ] 초대 모달: 링크 복사 + Web Share API (`navigator.share`) + 카운터 표시 ("3/10명 초대")
- [ ] Anti-abuse: OAuth provider별 1회 + 동일 IP에서 최대 4등록
- [ ] GA4 이벤트: `referral_share`, `referral_click_in` (가입자 측), `referral_redeem_success`, `referral_abuse_blocked`
- [ ] 약관·개인정보처리방침에 IP·디바이스 항목 추가 (이미 자동수집 항목에 IP 있으므로 명시 강화)

### 2.2 Out of Scope

- 단계별 보상 (5명·10명 보너스 배수 등) — Phase 2
- 카카오톡 SDK 직접 통합 — Web Share로 충분, Phase 2
- Twitter·Facebook 전용 공유 버튼 — Web Share에 native sheet으로 대체
- Leaderboard / 친구 초대 랭킹 — Phase 2
- 보너스 크레딧 만료 — 영구 보유 (간단함)
- 이미 가입한 사용자에게 1회성 코드 발급 (예: 마이그레이션 시점에 보너스 지급) — Phase 2
- 보너스 크레딧 환불·이체 — 불가능
- 가입자 보너스를 분할 지급 (N일에 나눠) — 즉시 일괄 지급

### 2.3 의도된 차이 (현 시스템과 비교)

- **일일 크레딧 모델 변경 0** — 자정 리셋·이월 X 정책 그대로 유지
- **보너스 크레딧만 별도 룰** — 이월 가능, 무기한
- **소진 우선순위**: 보너스 → 일일 → 사용자 체감 즉시 보너스 효과

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `profiles.referral_code` 자동 생성 (가입 시점 / 8자 alphanumeric / unique) | High | Pending |
| FR-02 | `?ref={code}` 쿼리 → sessionStorage 보존 → OAuth callback 후에도 유지 | High | Pending |
| FR-03 | 가입 완료 시점에 redeem API 자동 호출 | High | Pending |
| FR-04 | 초대자 +10cr / 가입자 +10cr 양쪽 즉시 지급 | High | Pending |
| FR-05 | `consume`이 보너스 → 일일 순서로 차감 | High | Pending |
| FR-06 | 초대자 누적 10명 상한, 초과 시 보너스 X (카운터만 +1) | High | Pending |
| FR-07 | OAuth provider별 1회 + 동일 IP 4건 차단 (이상 시 redeem 거부) | High | Pending |
| FR-08 | 더보기 메뉴 "친구 초대" 항목 추가 (사이드바·BottomNav 아님, 더보기) | Medium | Pending |
| FR-09 | 초대 모달: 링크·복사 버튼·Web Share API native sheet (모바일) / 복사만 (데스크톱) | Medium | Pending |
| FR-10 | 모달 내 카운터 ("3/10명 초대") + 보너스 누적 표시 | Medium | Pending |
| FR-11 | GA4 4종 이벤트 (`referral_share`, `referral_click_in`, `referral_redeem_success`, `referral_abuse_blocked`) | Medium | Pending |
| FR-12 | 보너스 크레딧 잔액 표시 (헤더 크레딧 영역에 통합) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | Redeem API 응답 < 200ms (블로킹 X — fire-and-forget OK) | Network 탭 |
| Privacy | 개인정보처리방침 IP·디바이스 항목 명시 (K-PIPA 적합) | 페이지 검토 |
| Security | referral_code는 충돌 가드 + UUID 추측 불가성 (8자 alphanumeric = 62^8 ≈ 218조) | 코드 검증 |
| Reliability | redeem 실패가 가입 흐름 차단 X (try/catch) | 코드 패턴 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 마이그레이션 적용 후 기존 사용자 모두 referral_code 자동 부여
- [ ] OAuth 4종(Google·Kakao·Naver·Apple) 모두 `?ref=` 보존 동작
- [ ] redeem 성공 시 양쪽 잔액 +10cr 즉시 반영
- [ ] 보너스 크레딧 소진 우선순위 정상
- [ ] 11명째 초대 시도 시 보상 없이 카운터만 +1
- [ ] 자기참조·abuse 케이스 차단 확인
- [ ] 더보기 모달 + 공유 정상
- [ ] GA4 DebugView에서 4종 이벤트 발사 확인

### 4.2 Quality Criteria

- [ ] TypeScript strict 통과
- [ ] 빌드·lint·type-check 통과
- [ ] redeem 실패가 가입 흐름 차단하지 않음 (try/catch + 로깅)
- [ ] referral_code 충돌 시 재시도 (최대 5회) — 5회 실패는 admin 알림

### 4.3 Outcome Criteria (출시 4주 후 GA4)

- [ ] 신규 가입자 중 referral 경유 비율 20%+
- [ ] 초대자 1인당 평균 2~3명 초대
- [ ] 보너스 받은 가입자의 곡 생성율 50%+ (일반 가입자 대비 비교)
- [ ] 자기참조 abuse 차단율 95%+

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 자기참조 abuse (한 사람 4 OAuth 계정) | Medium | High | OAuth provider별 1회 + 동일 IP 4건 상한. 100% 차단 불가지만 비용 대비 효율적 균형 |
| MiniMax 호출 비용 폭증 | High | Low | 가입자당 max +10cr, 초대자당 max +100cr. 1만 가입 = 100만cr ≈ MiniMax 비용 $1,500~$15,000 (모델 mix). 일일 redeem 상한 도입 가능 |
| 기존 사용자 박탈감 | Low | Medium | 명확히 "신규 가입 시점만 유효" 안내. Phase 2에 마이그레이션 시점 일회성 부여 고려 |
| referral_code 충돌 (8자 = 62^8 충돌 확률 낮음) | Low | Very Low | 충돌 시 최대 5회 재시도. 그 이후엔 admin 알림 |
| Web Share API 미지원 브라우저 | Low | Low | navigator.share 부재 시 복사 버튼만 노출 (graceful degradation) |
| 봇 가입 (자동화) | Medium | Low | 이미 OAuth 4종만 허용 (이메일 차단) → 봇 마찰 큼. 추가 captcha 불필요 |
| 사용자 IP가 동일(가족·공용 wifi)으로 차단 | Low | Medium | IP 4건 상한이 현실적 균형. 5명 가족이라면 1명만 차단 |
| 보너스 잔액 추적 누락 | Medium | Low | consume 함수에 단일 진입점, 보너스 → 일일 우선순위 명시 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `profiles` 테이블 | DB Schema | 4개 컬럼 추가 (referral_code, referred_by, referrer_bonus_count, bonus_credits) |
| 가입 트리거 (handle_new_user) | DB Function | referral_code 자동 생성 |
| `services/credit.service.ts` | Service | consume 함수에 보너스 → 일일 순서 차감 로직 |
| `app/api/referral/redeem/route.ts` | API | **신규** — 코드 검증·anti-abuse·양쪽 보상 |
| `app/auth/callback/route.ts` | Server | sessionStorage에서 ref 코드 읽어 redeem 호출 |
| `components/AuthProvider.tsx` | Client | OAuth 진입 시 `?ref=` 보존 (sessionStorage) |
| `app/(main)/layout.tsx` | Component | 더보기 메뉴에 "친구 초대" 항목 + 모달 토글 |
| `components/ReferralModal.tsx` | Component | **신규** — 링크 표시·복사·Web Share·카운터 |
| `utils/analytics.ts` | Const | 4종 이벤트명 추가 |
| `app/(legal)/privacy/page.tsx` | Content | IP·디바이스 항목 명시 강화 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `credit.service.consume` | 호출 | `app/api/generate` + cleanup-generating cron | 보너스 우선 차감 적용 (선형 변경) |
| `credit.service.getCreditState` | 호출 | `app/api/credits/me` + UI | 응답에 `bonusCredits` 필드 추가 |
| OAuth callback | redirect | `app/auth/callback/route.ts` | sessionStorage refcode 검증 후 redeem |
| handle_new_user 트리거 | INSERT | DB | referral_code 컬럼 자동 채움 |

### 6.3 Verification

- [ ] 마이그레이션 적용 후 기존 사용자 referral_code 일괄 부여 확인 (재실행 가능 SQL)
- [ ] OAuth 4종 모두 `?ref=` 보존·redeem 동작 (수동 테스트)
- [ ] consume이 보너스 → 일일 순서로 정확히 차감 (단위 검증)
- [ ] redeem 실패가 가입 흐름 차단 안 함 (try/catch 검증)

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic (변경 없음)

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| referral_code 형식 | UUID / 8자 alphanumeric / 6자 숫자 | 8자 alphanumeric | URL 친화·충돌 확률 낮음·base36/62 |
| 보너스 vs 일일 통합 | 단일 컬럼 / 별도 컬럼 | 별도 컬럼 (bonus_credits) | 이월 정책 차이·소진 우선순위 명확화 |
| 소진 순서 | 일일 → 보너스 / 보너스 → 일일 | 보너스 → 일일 | 사용자 체감 보너스 즉시 효과 |
| 가입자 보너스 시점 | 가입 즉시 / onboarding 완료 / 첫 곡 생성 | 가입 즉시 | 마찰 최소, 첫 곡 생성 동기 강화 |
| 상한 처리 | 11명째 차단 / 보상 X 카운터만 | 보상 X 카운터만 | 사용자가 11명 이상 초대하는 동기 유지 (자랑·기여) |
| Anti-abuse | provider만 / provider+IP / provider+device+IP | provider별 1회 + IP 4건 상한 | 현실적 균형, 4인 가족도 사용 가능 |
| 공유 옵션 | 복사만 / 복사+Web Share / SDK 통합 | 복사+Web Share | 모바일 native sheet으로 충분, SDK 부담 회피 |
| 모달 위치 | 사이드바 / 더보기 / 헤더 / 프로필 | 더보기 (사이드바 항목으로 격상은 Phase 2) | 1차 도입 시 마찰 최소, 운영 보고 확장 |
| sessionStorage vs 쿠키 | session / cookie | sessionStorage | OAuth callback 흐름에 동일 origin 유지, 쿠키 의존 회피 |

### 7.3 데이터 모델

```sql
ALTER TABLE profiles
  ADD COLUMN referral_code text UNIQUE,
  ADD COLUMN referred_by uuid REFERENCES profiles(id),
  ADD COLUMN referrer_bonus_count int DEFAULT 0,
  ADD COLUMN bonus_credits int DEFAULT 0;

CREATE INDEX profiles_referral_code_idx ON profiles(referral_code);
CREATE INDEX profiles_referred_by_idx ON profiles(referred_by);

-- handle_new_user 트리거에서 referral_code 자동 생성
-- SELECT 8자 alphanumeric random, 충돌 시 재시도
```

추가 추적용 테이블 (선택, MVP는 profiles만으로 충분):
```sql
-- 향후 referral_redemptions 테이블로 분리 가능 (현재는 profiles에 통합)
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] TypeScript strict
- [x] Supabase SSR auth (OAuth 4종)
- [x] credit.service.ts (일일 10cr 시스템 존재)
- [x] GA4 이벤트 wiring 패턴 (utils/analytics.ts)
- [x] 더보기 메뉴 (이용약관·개인정보·운영정책·자주 묻는 질문)

### 8.2 Conventions to Define

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| referral_code 형식 | missing | 8자 alphanumeric (lowercase a-z + 0-9) | High |
| sessionStorage 키 | mono.* 패턴 | `mono.referral.code` | Medium |
| Web Share API fallback | missing | navigator.share 부재 시 복사 버튼만 | Medium |

### 8.3 Environment Variables Needed

추가 없음.

---

## 9. Next Steps

1. [ ] `/pdca design referral` — 3 아키텍처 옵션 비교 + Option 선택
2. [ ] `/pdca do referral` — 마이그레이션 + service + API + UI 구현
3. [ ] 수동 QA (OAuth 4종 모두 `?ref=` 보존 검증)
4. [ ] GA4 DebugView 이벤트 확인
5. [ ] 출시 1주 후 referral 경유 가입자 비율 모니터링
6. [ ] (Phase 2) 마이그레이션 시점 기존 사용자에게 일회성 코드
7. [ ] (Phase 2) 카카오톡 SDK·Twitter 공유 버튼
8. [ ] (Phase 2) 단계별 보너스 (5명·10명 도달 시 추가 +50cr 등)
9. [ ] (Phase 2) Leaderboard / 가장 많이 초대한 사용자 표시

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-08 | Initial draft (4 결정 확정 후 작성) | iamjinwang@gmail.com |
