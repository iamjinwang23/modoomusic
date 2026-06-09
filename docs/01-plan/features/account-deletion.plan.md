# account-deletion Planning Document

> **Summary**: 인앱 회원 탈퇴 — 사유 수집 + 7일 grace period soft delete + 운영정책 제7조 준수 영구 파기
>
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-09
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 운영정책 제7조에 탈퇴 시 데이터 처리 정립됐지만 인앱 기능·API 없음. 현재 이메일 수동 처리만 가능 → 사용자 마찰·운영 부담·법적 결격 |
| **Solution** | 프로필 수정 모달 → 2단계 모달 (확인 + 사유 라디오 + "탈퇴하기" CTA) → soft delete (deleted_at 마킹) → 7일 grace period 동안 같은 OAuth 재로그인 시 자동 복구, 그 후 cron이 운영정책 제7조 영구 파기 실행 |
| **Function/UX Effect** | 사용자 측면: 마찰 없이 직접 탈퇴 + 변심 시 7일 안 복구 가능. 운영 측면: 통계 가능한 익명 탈퇴 사유 데이터 + "탈퇴 후 복구" 문의 대량 감소 |
| **Core Value** | 법적 정합성 마무리(K-PIPA·약관·운영정책 일치) + 제품 개선 시그널 수집 + retention 기회(grace period로 1주 안 복귀자 자연 복원) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영정책 제7조 정립됐지만 인앱 기능 부재로 법적 결격·사용자 마찰. 결제 인프라 도입 전 마지막 정합성 정비 |
| **WHO** | 탈퇴 의사 있는 회원·실수 탈퇴자(grace period 수혜)·제품 개선을 위해 이탈 원인 분석할 운영자 |
| **RISK** | "지체 없이 파기" K-PIPA 의무와 grace period 충돌 우려 / 친구 초대 코드 부정 사용 / RLS 누락으로 탈퇴자 데이터 노출 |
| **SUCCESS** | 인앱 탈퇴 정상 동작 / 7일 안 재로그인 시 100% 복원 / 7일 경과 시 운영정책 제7조 정확히 적용 / 탈퇴 사유 통계 수집 가능 |
| **SCOPE** | profiles.deleted_at + 사유 로그 테이블 + 2단계 모달 + soft delete RPC + 7일+ 영구 파기 cron + RLS 정책 + 운영정책 제7조 조항 추가 |

---

## 1. Overview

### 1.1 Purpose

회원이 인앱에서 탈퇴할 수 있게 하고, 7일 grace period로 실수·변심 대비를 만들고, 7일 경과 시 운영정책 제7조에 정립된 데이터 처리 정책을 정확히 자동 실행한다.

### 1.2 Background

- **2026-06-08**: 운영정책 제7조 (회원 탈퇴 시 데이터 처리) 신설 — 9 데이터 유형별 처리 방식 명시
- 현재 인앱 기능 없음 → "고객센터 이메일로 요청" 안내
- K-PIPA·약관·운영정책 모두 인앱 기능 전제로 작성됐지만 구현이 부재
- 결제 인프라 도입 전이 정비 적기 (회계 이슈 발생 전)

### 1.3 Related Documents

- 운영정책 제7조: `app/(legal)/policy/page.tsx`
- 이용약관 제11조: `app/(legal)/terms/page.tsx`
- 개인정보처리방침: `app/(legal)/privacy/page.tsx`

---

## 2. Scope

### 2.1 In Scope

- [ ] DB: `profiles.deleted_at timestamptz` + 인덱스 + RLS 정책 업데이트
- [ ] DB: `account_deletion_logs` 테이블 (익명 사유 통계, 개인 식별 정보 0)
- [ ] DB: 탈퇴자 placeholder profile (`00000000-0000-0000-0000-000000000000` username "(탈퇴한 회원)")
- [ ] RPC: `request_account_deletion(user_id, reason_category, reason_text)` — soft delete + 로그 + 친구 초대 코드 무효화
- [ ] RPC: `restore_account(user_id)` — grace period 내 복구
- [ ] RPC: `finalize_account_deletion(user_id)` — 7일+ 영구 파기 (제7조 적용)
- [ ] API: `POST /api/account/delete` (soft delete + 사유 저장)
- [ ] API: `POST /api/account/cancel-deletion` (grace period 내 즉시 복구)
- [ ] Cron: `/api/cron/finalize-deletions` 매일 KST 03:00, `deleted_at + 7 days < now()` row 영구 파기
- [ ] UI: ProfileEditModal 하단 "회원 탈퇴" 링크 (조용한 회색)
- [ ] UI: 탈퇴 확인 모달 (2단계)
  - 1단계: "정말 탈퇴하시겠습니까?" + 7일 grace period·정책 요약 안내 + "계속" 버튼
  - 2단계: 사유 라디오 (5종) + 자유 텍스트 (옵션) + "탈퇴하기" CTA
- [ ] UI: 탈퇴자 재로그인 시 토스트 "다시 오신 걸 환영해요. 계정이 복원되었어요" (AuthProvider SIGNED_IN 분기)
- [ ] AuthProvider: SIGNED_IN 시 `deleted_at` 확인 → 7일 이내면 자동 복원, 7일 초과면 신규 가입 흐름 (auth.users는 cron으로 정리)
- [ ] 모든 공개 쿼리: `deleted_at IS NULL` 필터 추가 (RLS로 자동화 권장)
- [ ] 친구 초대 RPC: `redeem_referral`에 `deleted_at IS NULL` 추가 (탈퇴자 코드 무효)
- [ ] 운영정책 제7조: 7일 grace period 조항 추가, 시행일 갱신
- [ ] FAQ: 탈퇴 관련 답안 업데이트 (인앱 기능 안내·grace period 명시)
- [ ] GA4 이벤트: `account_deletion_request` (사유 카테고리 포함), `account_deletion_restored`

### 2.2 Out of Scope

- 탈퇴 후 일정 기간 재가입 차단 (악용 방지 차원) — Phase 2 검토
- 탈퇴 사유 응답을 회원에게 공유·답변 (운영자 → 회원 follow-up) — Phase 2
- 탈퇴 통계 어드민 대시보드 — Phase 2 (현재는 DB 직접 쿼리)
- 정량 데이터 백업 옵션 ("내 곡 zip 다운로드") — 다운로드 기능 자체가 미구현
- Family·Team 계정 일괄 탈퇴 — 단일 계정 모델
- 탈퇴 30일·90일 변형 — 7일 고정
- Hard delete 직접 옵션 (grace skip) — 7일 무조건 적용
- 탈퇴 사유에 따른 분기 UX — 단일 흐름

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | profiles에 `deleted_at` 컬럼 추가, NULL 기본값 | High | Pending |
| FR-02 | 모든 공개 SELECT(곡·댓글·프로필·검색)는 `deleted_at IS NULL` 필터 | High | Pending |
| FR-03 | 탈퇴 시 단일 트랜잭션으로 soft delete + 사유 로그 + 친구 초대 코드 무효화 | High | Pending |
| FR-04 | 7일 grace period 동안 같은 OAuth 재로그인 시 자동 복구 | High | Pending |
| FR-05 | 7일 경과 시 cron이 운영정책 제7조 데이터 처리 적용 (공개 곡·댓글 익명화, 그 외 파기) | High | Pending |
| FR-06 | 친구 초대 코드 redeem 시 owner의 `deleted_at IS NULL` 확인 — 탈퇴자 코드 무효 | High | Pending |
| FR-07 | 탈퇴 사유 5종 라디오 (필수 선택) + 자유 텍스트 200자 (선택) | High | Pending |
| FR-08 | 사유 저장 시 user_id 제거, age_days·song_count 등 통계 컨텍스트만 보관 | High | Pending |
| FR-09 | 프로필 수정 모달 → "회원 탈퇴" 링크 → 2단계 모달 | High | Pending |
| FR-10 | 복원 시 토스트 "다시 오신 걸 환영해요" + 모든 데이터 정상 노출 | Medium | Pending |
| FR-11 | GA4: `account_deletion_request` · `account_deletion_restored` | Medium | Pending |
| FR-12 | 운영정책 제7조에 7일 grace period 조항 추가, 시행일 2026-06-09 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Privacy | 사유 로그에 user_id·이메일·OAuth ID 등 개인 식별 정보 0 | DB 스키마 검토 |
| Compliance | 운영정책 제7조에 grace period 명시, K-PIPA "지체 없이" 해석 부합 | 정책 페이지 검토 |
| Reliability | cron 실패가 다른 사용자에게 영향 0 (try/catch + 사용자별 분리 트랜잭션) | 코드 패턴 검증 |
| Performance | 탈퇴 RPC 응답 < 500ms (트랜잭션 1회) | API 호출 시간 측정 |
| Security | 인증된 본인만 본인 계정 탈퇴 가능 (다른 user_id 탈퇴 차단) | RPC 인증·user_id 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 마이그레이션 적용 후 기존 사용자 영향 없음 (deleted_at NULL 기본)
- [ ] 탈퇴 RPC가 단일 트랜잭션으로 soft delete + 사유 로그 + 친구 초대 코드 무효화 수행
- [ ] 7일 grace period 내 재로그인 → 자동 복원 + 토스트
- [ ] 7일 경과 cron → 운영정책 제7조 데이터 처리 100% 적용 (공개 곡 익명화·비공개 곡 삭제 등)
- [ ] 공개 쿼리에 deleted_at 필터 적용 (탈퇴자 데이터 노출 0)
- [ ] 친구 초대 코드 redeem 시 탈퇴자 코드 차단
- [ ] 운영정책·FAQ 업데이트 배포

### 4.2 Quality Criteria

- [ ] TypeScript strict 통과
- [ ] 빌드·lint 통과
- [ ] 인증 없이 다른 user_id 탈퇴 시도 → 401
- [ ] 탈퇴 RPC 실패가 사용자 액션을 막지 않음 (적절한 에러 안내)

### 4.3 Outcome Criteria (출시 4주 후)

- [ ] 탈퇴 사유 통계 수집 (총 탈퇴 수 N건, 카테고리별 분포)
- [ ] grace period 내 복귀율 (탈퇴 후 7일 내 재로그인 비율)
- [ ] "탈퇴 후 복구해주세요" 이메일 문의 0건

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| K-PIPA "지체 없이 파기"와 7일 grace period 충돌 우려 | Medium | Low | 운영정책 제7조에 grace period 명시 + 통상 K-PIPA 해석상 30일까지 합리적 |
| RLS 정책 누락으로 탈퇴자 데이터 일부 노출 | High | Medium | 모든 공개 SELECT에 RLS 정책 + 코드 grep으로 수동 검증 |
| 친구 초대 코드 부정 사용 (탈퇴자 코드 통해 가입) | Medium | Medium | redeem_referral RPC에 `owner.deleted_at IS NULL` 추가 |
| Soft delete 후 auth.users에 OAuth 식별자 충돌 | Low | Low | auth.users는 7일 경과 cron에서 admin.deleteUser로 처리 |
| 사용자가 7일 내 다른 OAuth로 가입 시도 | Low | Medium | 신규 가입 처리 (이전 계정과 자동 연결 X) — 사용자에게 안내 필요 |
| Cron 실패로 일부 데이터 미파기 (법적 결격) | High | Low | 재시도 로직 + 운영자 알림 (Sentry 등 추후) |
| 사유 로그에 user_id가 우연히 섞임 (개인정보 유출) | High | Low | 사유 로그 INSERT 시 user_id 컬럼 없음 (스키마 차원 차단) |
| ProfileEditModal에서 탈퇴 버튼 잘못 클릭 | Low | Medium | 2단계 확인 + 사유 라디오 입력 필수 + 마지막 CTA로 마무리 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `profiles` 테이블 | DB Schema | `deleted_at timestamptz` 컬럼 추가 |
| `account_deletion_logs` 테이블 | DB Schema | **신규** — 익명 사유 통계 |
| 탈퇴자 placeholder profile | DB Row | 마이그레이션 시 1회 INSERT |
| `request_account_deletion` RPC | DB Function | **신규** |
| `restore_account` RPC | DB Function | **신규** |
| `finalize_account_deletion` RPC | DB Function | **신규** — 운영정책 제7조 적용 |
| `redeem_referral` RPC | DB Function | `deleted_at IS NULL` 확인 추가 |
| `app/api/account/delete/route.ts` | API | **신규** |
| `app/api/account/cancel-deletion/route.ts` | API | **신규** |
| `app/api/cron/finalize-deletions/route.ts` | API | **신규** — Vercel Cron |
| `components/ProfileEditModal.tsx` | Component | "회원 탈퇴" 링크 추가 |
| `components/AccountDeletionModal.tsx` | Component | **신규** — 2단계 확인 모달 |
| `components/AuthProvider.tsx` | Component | SIGNED_IN 시 deleted_at 확인 + 복원·토스트 |
| `services/explore.service.ts` 등 공개 쿼리 | Service | RLS로 자동 처리, 미적용 시 명시 필터 |
| `app/(legal)/policy/page.tsx` | Content | 제7조에 7일 grace period 조항 추가 |
| `app/(legal)/faq/page.tsx` | Content | 탈퇴 관련 답안 업데이트 |
| `utils/analytics.ts` | Const | 2 이벤트 추가 |
| `vercel.json` (또는 Vercel UI) | Config | 새 cron 등록 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `profiles` SELECT (공개) | 검색·팔로우·둘러보기 | exploreService, searchService 등 | RLS에 deleted_at 추가 시 자동 필터 / 명시 시 5~10곳 패치 필요 |
| `songs` SELECT (공개) | 둘러보기·카드 | exploreService.getFeed 등 | songs는 작성자 id로 가는데, songs.user_id가 profile.deleted_at 영향. JOIN 필터 또는 별도 처리 |
| 친구 초대 redeem | `/api/referral/redeem` | redeem_referral RPC | RPC 내부에 deleted_at 확인 추가 |
| 알림 actor | profile join | notificationService | 탈퇴자 actor는 NULL 처리 또는 "(탈퇴한 회원)" 표시 |

### 6.3 Verification

- [ ] 마이그레이션 적용 후 모든 기존 사용자 deleted_at NULL 확인
- [ ] RLS 정책 적용 후 공개 쿼리 결과 변화 없음 (탈퇴자 0명이므로)
- [ ] 테스트 계정 탈퇴 → 다른 계정에서 해당 곡·프로필 검색 시 노출 0건
- [ ] 7일 내 재로그인 → 모든 데이터 복원
- [ ] 8일 후 cron → 운영정책 제7조 적용 후 데이터 확인

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic (변경 없음)

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Soft delete vs Hard delete | Soft / Hard / Hybrid | Soft (7일) + Hard (cron) | 실수·변심 대응 + 운영정책 제7조 정확 적용 |
| Grace period 길이 | 1일·7일·30일 | 7일 | 사용자 명시. K-PIPA 부합 |
| 탈퇴자 placeholder | 더미 프로필 / NULL FK | 더미 프로필 | FK 유지·디스플레이 단순 (사용자 명시) |
| 사유 수집 방식 | 라디오 강제 / 선택 / 자유 텍스트만 | 라디오 강제 + 자유 텍스트 선택 | 통계 구조 명확 + 디테일 보존 |
| 탈퇴 진입점 | 프로필 수정 모달 / 별도 설정 페이지 | 프로필 수정 모달 (사용자 명시) | 정비 일관성·구현 단순 |
| 마지막 확인 | "탈퇴" 글자 입력 / CTA 클릭 | CTA 클릭 (사용자 명시) | 마찰 최소화·2단계 확인 |
| 사유 로그 user_id 저장 | 저장 / 미저장 | 미저장 | K-PIPA 사후 식별 가능성 차단 |
| RLS vs 명시 필터 | RLS 자동 / 코드 grep 수동 | RLS 우선 + 명시 보조 | 누락 위험 최소화 |
| Cron 주기 | 매시간 / 매일 / 매주 | 매일 KST 03:00 | 다른 cron(notifications cleanup)과 동일 시간대 |

### 7.3 데이터 모델

```sql
ALTER TABLE profiles ADD COLUMN deleted_at timestamptz;
CREATE INDEX profiles_deleted_at_idx ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- 탈퇴 사유 로그 (개인 식별 정보 0)
CREATE TABLE account_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_category text NOT NULL,         -- 'quality' | 'no_ideas' | 'switching' | 'privacy' | 'pause' | 'other'
  reason_text text,                       -- 자유 텍스트 (선택, 200자 max)
  user_age_days integer,                  -- 가입 후 경과 일수
  song_count integer,                     -- 만든 곡 수
  had_bonus_credits boolean,              -- 친구 초대 보너스 받은 적 있는지
  created_at timestamptz DEFAULT now()
);

-- 탈퇴자 placeholder profile
INSERT INTO profiles (id, username, display_name, onboarding_done)
VALUES ('00000000-0000-0000-0000-000000000000', 'deleted_user', '(탈퇴한 회원)', true)
ON CONFLICT DO NOTHING;
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] Supabase RPC 패턴 (referral, recommended_creators 등)
- [x] Vercel Cron 패턴 (notifications cleanup·tags backfill 등)
- [x] AuthProvider onAuthStateChange 분기
- [x] toast 시스템

### 8.2 Conventions to Define

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 사유 카테고리 ID | missing | snake_case 5종 + 'other' | High |
| deleted placeholder UUID | missing | `00000000-0000-0000-0000-000000000000` | High |
| grace period 길이 | missing | `7 days` 상수 (DB·코드 동일) | High |

### 8.3 Environment Variables Needed

추가 없음 (기존 `CRON_SECRET` 재사용)

---

## 9. Next Steps

1. [ ] `/pdca design account-deletion` — 3 아키텍처 옵션 비교 + Option 선택
2. [ ] `/pdca do account-deletion` — 마이그레이션 + RPC + API + UI + cron 구현
3. [ ] 운영정책 제7조 7일 grace 조항 추가
4. [ ] FAQ 탈퇴 답안 업데이트
5. [ ] 출시 4주 후 탈퇴 사유 통계 첫 분석

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-09 | Initial draft (4 결정 + grace period + 사유 수집 + 2단계 모달 확정) | iamjinwang@gmail.com |
