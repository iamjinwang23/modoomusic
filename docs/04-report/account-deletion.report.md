# account-deletion Completion Report

> **PDCA Cycle**: Plan → Design → Do → Check → Report
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Cycle Duration**: 2026-06-09 (단일 세션 ~6시간)
> **Final Match Rate**: ~98%
> **Status**: Shipped to prod (modoomusic.com)

---

## Executive Summary

| Perspective | Content |
|---|---|
| **Problem** | 운영정책 §7 (탈퇴 시 데이터 처리)는 정립됐지만 인앱 기능 부재 — 사용자는 이메일 수동 요청, 법적 결격, "탈퇴 후 복구" 문의 잠재 위험 |
| **Solution** | 2단계 모달(정책 요약 → 사유 5종 + 200자)로 인앱 탈퇴 + 7일 grace period(자동 복원) + cron 영구 파기. 즉시 익명화(Option A)로 정책과 grace 일관성 확보 |
| **Function/UX Effect** | 사용자: 마찰 없는 탈퇴 + 변심 시 자동 복원 + 작별 페이지로 정중한 마무리. 운영: 익명 사유 통계 + "복구해주세요" 문의 0건 목표 + 법적 정합성 마무리 |
| **Core Value** | K-PIPA·약관·운영정책 3중 정합성 + 제품 개선 시그널 수집 + retention 기회(grace 복귀자) + 결제 인프라 도입 전 마지막 결격 사항 정리 |

### 1.3 Value Delivered

| 측면 | 결과 |
|---|---|
| **법적 정합성** | 운영정책 §7 grace 조항 추가·시행일 2026-06-09. 인앱 기능 100% 가동 |
| **UX 일관성** | Day 0부터 "(탈퇴한 회원)" 일관 노출 (Option A). 7일 내 재로그인 → 자동 복원 + 토스트 |
| **운영 데이터** | `account_deletion_logs` 익명 통계 수집 시작 (GA4 `account_deletion_request` + 사유 카테고리) |
| **보안·프라이버시** | 사유 로그 user_id 미저장 (K-PIPA 안전). placeholder 보호 (탈퇴·파기 모두 차단) |

---

## 1. Cycle Overview

| Phase | Output | Match Rate / Status |
|---|---|---|
| Plan | `docs/01-plan/features/account-deletion.plan.md` | 12 FR · 4 SC · 9 Decisions |
| Design | `docs/02-design/features/account-deletion.design.md` | Option C (Pragmatic) → +14 Decisions |
| Do | 31 파일 변경 (+1,917 / -31) | 단일 세션 완료 |
| Check (1차) | `docs/03-analysis/account-deletion.analysis.md` | 94% (Important 2) |
| Iterate | `!inner` 6 파일 + 작별 페이지 + Design §4/10 갱신 | 94% → ~98% |
| Post-QA Discovery | grace 일관성 결함 발견 → Migration 025 (Option A) | 정책 §7과 100% 일치 |

---

## 2. Module Map (실제 구현)

| Module | 파일 | LOC | 비고 |
|---|---|---|---|
| migration 024 | `supabase/migrations/024_account_deletion.sql` | ~273 | deleted_at + logs + placeholder + 3 RPC + redeem_referral 패치 + RLS |
| migration 025 | `supabase/migrations/025_immediate_anonymization.sql` | ~155 | original_user_id 컬럼 + 3 RPC 갱신 (Option A) |
| service | `services/account.service.ts` | ~81 | requestDeletion · restoreAccount · finalizeDeletions |
| API delete | `app/api/account/delete/route.ts` | ~26 | POST, 409 already_deleted |
| API cancel | `app/api/account/cancel-deletion/route.ts` | ~17 | POST, 410 grace_period_expired |
| cron 번들 | `app/api/cron/cleanup-notifications/route.ts` | +12 | Vercel Hobby 2 cron 한도 대응 |
| modal | `components/AccountDeletionModal.tsx` | ~190 | 2 stage + BeamBorder + 200자 카운터 |
| profile edit | `components/ProfileEditModal.tsx` | +14 | 하단 "회원 탈퇴" 링크 + 모달 mount |
| auth | `components/AuthProvider.tsx` | +23 | SIGNED_IN 시 deleted_at 분기 + 복원 |
| 작별 페이지 | `app/farewell/page.tsx` | ~42 | 감사 멘트 + 7일 grace 안내 + 홈으로 |
| 모바일 메뉴 통합 | `features/explore/components/ProfilePanel.tsx` | +63 | SelfSettingsMenu + React Portal |
| policy §7 | `app/(legal)/policy/page.tsx` | +6 | grace 조항 + 시행일 |
| FAQ | `app/(legal)/faq/page.tsx` | 1 답안 갱신 | 인앱 탈퇴 안내 |
| analytics | `utils/analytics.ts` | +2 이벤트 | request · restored |
| FR-02 inner join | 6 파일 | 6 lines | 탈퇴자 행 자동 제외 |

**총 변경**: 34 파일, +2,125 / -32

---

## 3. Plan Success Criteria — Final Status

| FR | 상태 | 증거 |
|---|---|---|
| FR-01 deleted_at 컬럼 | ✅ Met | mig 024:9-12 |
| FR-02 공개 SELECT deleted_at 필터 | ✅ Met | profiles_select RLS + `!inner` 6 파일 |
| FR-03 soft delete + 로그 + referral 무효화 | ✅ Met | mig 024:68-114 + mig 025 (즉시 익명화) |
| FR-04 7일 grace 자동 복원 | ✅ Met | AuthProvider:82-103 + mig 025 revert 로직 |
| FR-05 cron §7 적용 | ✅ Met | finalize_account_deletion + cleanup-notifications 번들 |
| FR-06 referral 탈퇴자 차단 | ✅ Met | redeem_referral `AND deleted_at IS NULL` |
| FR-07 라디오 5종 + 200자 텍스트 | ✅ Met | AccountDeletionModal |
| FR-08 사유 user_id 미저장 | ✅ Met | account_deletion_logs 스키마 차원 차단 |
| FR-09 ProfileEditModal 진입점 | ✅ Met | 하단 "회원 탈퇴" 링크 |
| FR-10 복원 토스트 + 데이터 정상 | ✅ Met | "다시 오신 걸 환영해요" + refreshProfile |
| FR-11 GA4 2 이벤트 | ✅ Met | EVENTS.ACCOUNT_DELETION_REQUEST · _RESTORED |
| FR-12 §7 grace 조항 + 시행일 | ✅ Met | policy:12, 233-235 |

**Success Rate: 12 / 12 = 100%**

---

## 4. Key Decisions & Outcomes

| # | Decision | Followed? | Outcome |
|---|---|:--:|---|
| 1 | Option C (Pragmatic) | ✅ | service 단일 + 모달 단일. 유지보수 부담 최소 |
| 2 | placeholder 고정 UUID `00000000...` | ✅ | FK 무결성 유지. 익명화 시각화 단순 |
| 3 | 사유 로그 user_id 미저장 | ✅ | K-PIPA 안전. 통계 가치는 유지 |
| 4 | RLS 우선 + 명시 보조 | ✅ | profiles_select 갱신으로 자동 차단 |
| 5 | Cron 매일 KST 03:00 | ✅* | *cleanup-notifications에 번들 (Hobby 한도) |
| 6 | 2단계 모달 단일 컴포넌트 | ✅ | stage state 'confirm'/'reason' 분기 |
| 7 | Stage 1 "계속" / Stage 2 "탈퇴하기" | ✅ | 텍스트 입력 마찰 없음 |
| 8 | 친구 초대 코드 자동 무효화 | ✅ | redeem_referral 패치 적용 |
| 9 | 복원 자동 (재로그인 트리거) | ✅ | AuthProvider SIGNED_IN 분기 |
| 10 | finalize는 cron만 service_role | ✅ | GRANT EXECUTE TO service_role |
| **11** | cron 번들링 | ✅ | Hobby 한도 대응. 시간대 유지 |
| **12** | REST status code 409/410 | ✅ | Design 갱신 + 코드 일관 |
| **13** | `profiles!fkey!inner` 강제 | ✅ | 6 파일 패치로 FR-02 보강 |
| **14** | Option A 즉시 익명화 | ✅ | Migration 025로 grace 일관성 확보 |

---

## 5. Architecture & Data Model

### 5.1 데이터 모델 (확정)

```sql
-- profiles
ADD COLUMN deleted_at timestamptz;  -- soft delete 마킹

-- songs / comments
ADD COLUMN original_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
-- 즉시 익명화 시 원본 user_id 백업, 복원 시 revert

-- account_deletion_logs (개인 식별 정보 0)
CREATE TABLE account_deletion_logs (
  id, reason_category, reason_text, user_age_days, song_count,
  had_bonus_credits, created_at
);

-- placeholder
auth.users + profiles 1행 (id = '00000000-0000-0000-0000-000000000000')
display_name = '(탈퇴한 회원)'
```

### 5.2 RPC 3종 (Option A 후)

| RPC | 권한 | 핵심 동작 |
|---|---|---|
| `request_account_deletion` | authenticated | soft delete + 사유 로그 + 공개 곡·댓글 즉시 익명화 |
| `restore_account` | authenticated | deleted_at NULL + user_id revert (songs·comments) |
| `finalize_account_deletion` | service_role | 비공개 곡 DELETE + 관계 정리 + profile DELETE |

### 5.3 Flow

```
[ProfileEditModal "회원 탈퇴" 링크]
     ↓
[AccountDeletionModal Stage 1: 정책 요약 + grace 안내]
     ↓ "계속"
[Stage 2: 사유 5종 + 200자 textarea]
     ↓ "탈퇴하기"
[POST /api/account/delete]
     ↓
[request_account_deletion RPC]
     ↓
[즉시 익명화 + signOut]
     ↓
[/farewell — 감사 멘트 + "홈으로 돌아가기"]


[7일 내 같은 OAuth 재로그인]
     ↓
[AuthProvider SIGNED_IN → deleted_at 확인]
     ↓
[POST /api/account/cancel-deletion]
     ↓
[restore_account RPC — user_id revert]
     ↓
[토스트 "다시 오신 걸 환영해요"]


[7일+ 매일 KST 03:00 cron — cleanup-notifications 번들]
     ↓
[finalize_account_deletion RPC]
     ↓
[비공개 곡 DELETE + 관계 정리 + profiles DELETE]
     ↓
[auth.admin.deleteUser]
```

---

## 6. Iteration History

| Iteration | Trigger | Action | Match Rate |
|---|---|---|---|
| Initial Do | 단일 세션 구현 완료 | 11 modules + cron 번들 + 작별 페이지 | 미측정 |
| Check 1차 | `/pdca analyze` | gap-detector — Important 2 (FR-02·status codes) | **94%** |
| Iterate | 사용자 승인 "지금 모두 수정" | `!inner` 6 파일 + Design §4/10 갱신 | **~98%** |
| Post-QA Discovery | 사용자 직감 "탈퇴 곡은 익명? 삭제?" | grace 7일간 곡 사라짐 발견 | 일관성 결함 |
| Iterate 2 | 사용자 선택 "Option A로 가자" | Migration 025 — 즉시 익명화 | **정책 §7 100% 일치** |

---

## 7. Architecture Deviations (Documented)

| Deviation | Reason | Decision Record |
|---|---|---|
| Cron 별도 등록 → cleanup-notifications 번들 | Vercel Hobby 2 cron 한도 | #11 |
| API status 코드 400 → 409 (already_deleted) · 410 (grace_period_expired) | REST 의미상 정확 | #12 |
| placeholder auth.users row 직접 INSERT | profiles.id FK 충족 | (mig 024:36-48) |
| `profiles_select` RLS에 `auth.uid() = id` OR | AuthProvider 본인 deleted_at 조회 필요 | (mig 024:302-304) |
| 마이그레이션 분리 (024 + 025) | grace 일관성 결함 후속 발견 | #14 |

---

## 8. Risks & Open Items

| Risk | Status | Mitigation |
|---|---|---|
| Cron 실패 시 일부 회원만 영향 | ✅ Mitigated | 사용자별 try/catch + console.error |
| RLS 누락으로 탈퇴자 데이터 노출 | ✅ Mitigated | 6 파일 `!inner` + Option A 익명화 |
| referral 부정 사용 | ✅ Mitigated | `redeem_referral` deleted_at 차단 |
| auth.users 삭제 실패 시 잔여 row | ⚠️ Open | finalize RPC + admin.deleteUser 순차 + try/catch. 모니터링 필요 |
| 비공개 곡이 7일간 사라짐 (소유주 logout 상태이므로 본인도 못 봄) | ✅ By Design | 복원 시 100% 복귀. 7일+ 영구 파기 정상 |
| 통계 분석 도구 부재 | ⚠️ Phase 2 | DB 직접 쿼리로 시작, 어드민 대시보드는 후속 |

---

## 9. Outcome Criteria (출시 4주 후 측정 예정)

- [ ] 탈퇴 사유 통계: 총 N건 + 카테고리별 분포
- [ ] grace period 내 복귀율 (탈퇴 후 7일 내 재로그인 비율)
- [ ] "탈퇴 후 복구해주세요" 이메일 문의 0건
- [ ] GA4: `account_deletion_request` · `account_deletion_restored` 정상 수집

---

## 10. Lessons Learned

1. **사용자 직감이 강한 회귀 신호** — analyze 단계에서 Match Rate 98% 통과 후에도 사용자의 "익명? 삭제?" 한 줄 질문이 grace 일관성 결함을 잡아냄. Static gap analysis만으로는 UX 일관성을 항상 잡지 못함.
2. **Vercel Hobby cron 한도가 아키텍처 결정에 영향** — Design 단계의 Open Questions 점검이 마이그레이션 재작성 비용을 막아줌. Do 진입 전 빠른 코드 점검 중요.
3. **PostgREST embed 기본은 LEFT OUTER** — RLS만 믿고 inner join 안 쓰면 FR-02 같은 보안·UX 결함 노출. 공개 SELECT 패턴 `!inner` 표준화 필요.
4. **마이그레이션 분리가 가독성·롤백 용이** — 024 vs 025 분리로 변경 의도가 명확. amend 대신 새 마이그레이션.
5. **placeholder 패턴은 FK + 익명화의 좋은 균형** — NULL FK 대비 디스플레이 단순 + 데이터 모델 일관.

---

## 11. Shipped Commits

| Commit | Description | Files |
|---|---|---|
| `131ef0c` | feat: 회원 탈퇴 기능 (7일 grace + 사유 수집) + 모바일 더보기 통합 | 31 (+1,917 / -31) |
| `08063b3` | fix(account-deletion): 즉시 익명화 (Option A) — grace 일관성 결함 해소 | 3 (+208 / -1) |

prod URL: https://modoomusic.com

---

## 12. Version History

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0 | 2026-06-09 | iamjinwang@gmail.com | PDCA cycle 완료. Match Rate ~98%. SC 12/12 Met. prod 배포 완료 |
