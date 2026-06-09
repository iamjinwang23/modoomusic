# account-deletion Gap Analysis

> **Phase**: PDCA Check
> **Date**: 2026-06-09
> **Author**: iamjinwang@gmail.com
> **Plan Ref**: `docs/01-plan/features/account-deletion.plan.md`
> **Design Ref**: `docs/02-design/features/account-deletion.design.md`

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 운영정책 §7 인앱 구현 — 법적 결격·UX 마찰 해소 |
| **WHO** | 탈퇴 의사 회원·grace 수혜자·이탈 사유 분석할 운영자 |
| **RISK** | K-PIPA·RLS 누락·referral 부정·cron 실패 |
| **SUCCESS** | 인앱 탈퇴 / 7일 100% 복원 / §7 적용 / 사유 통계 |
| **SCOPE** | deleted_at + 사유 로그 + 2단계 모달 + RPC 3종 + cron + RLS + §7 patch |

---

## 1. Strategic Alignment

- ✅ **PRD 문제 해결**: 인앱 탈퇴 부재 → 모달 + API + RPC로 해소
- ✅ **Plan SC 충족 경로 확보**: FR-01~FR-12 중 11개 Met, 1개 Partial (FR-02)
- ✅ **Design 결정 준수**: Option C (service 단일·모달 단일), placeholder UUID, 사유 user_id 미저장, RLS 우선 — 모두 구현됨
- ⚠️ **Design 대비 변경 3건** (문서화 필요):
  - cron 별도 등록 → `cleanup-notifications` 번들 (Vercel Hobby 2 cron 한도)
  - placeholder auth.users row 직접 INSERT (FK 충족)
  - profiles_select RLS에 `auth.uid() = id` OR 추가 (자기 deleted_at 조회 필요)

---

## 2. Match Rate

| 축 | 점수 | 가중치 | 기여 |
|---|---|---|---|
| Structural | 100% | 0.2 | 20.0 |
| Functional | 95% | 0.4 | 38.0 |
| Contract | 90% | 0.4 | 36.0 |
| **Overall** | **94%** | — | **94.0** |

Runtime 미실행 (테스트 인프라 없음) → static-only 공식 적용.

---

## 3. Plan Success Criteria (FR-01 ~ FR-12)

| FR | 상태 | 증거 |
|---|---|---|
| FR-01 deleted_at 컬럼 | ✅ Met | `024_account_deletion.sql:8-12` |
| FR-02 공개 SELECT deleted_at 필터 | ⚠️ Partial | `services/explore.service.ts:84`, `app/api/songs/[id]/comments/route.ts:28` — `profiles!fkey` (LEFT OUTER) → 탈퇴자 곡/댓글은 author=null 상태로 노출 |
| FR-03 soft delete + 로그 + referral 무효화 | ✅ Met | `024:68-114`, `024:222` |
| FR-04 7일 grace 자동 복원 | ✅ Met | `AuthProvider.tsx:82-103` |
| FR-05 cron §7 적용 | ✅ Met | `024:145-193`, `services/account.service.ts:46-80` |
| FR-06 referral 탈퇴자 차단 | ✅ Met | `024:222` |
| FR-07 라디오 5종 + 200자 텍스트 | ✅ Met | `AccountDeletionModal.tsx:22-29, 150-156` |
| FR-08 사유 user_id 미저장 | ✅ Met | `024:17-25` (스키마에 user_id 없음) |
| FR-09 모달 진입점 | ✅ Met | `ProfileEditModal.tsx:97, 381` |
| FR-10 복원 토스트 + 데이터 정상 | ✅ Met | `AuthProvider.tsx:95-97` |
| FR-11 GA4 2 이벤트 | ✅ Met | `utils/analytics.ts:31-32` |
| FR-12 §7 grace 조항 + 시행일 | ✅ Met | `policy/page.tsx:12, 233-235` |

**Met 11 + Partial 1 / 12 = 95.8%**

---

## 4. Gap List

### Critical

없음.

### Important

| # | Issue | 증거 | 제안 Fix |
|---|---|---|---|
| I-1 | FR-02 — 공개 곡/댓글 쿼리가 `profiles!fkey` LEFT OUTER → 탈퇴자 행이 author=null 상태로 노출. RLS는 profile 객체만 가리지 행은 제외 안함 | `services/explore.service.ts:84`, `app/api/songs/[id]/comments/route.ts:28`, `app/api/comments/[id]/route.ts:27`, `app/api/comments/[id]/reply/route.ts:28` | 3-4곳 `profiles!fkey` → `profiles!fkey!inner` 패치. RLS가 row 자체 제외. 본인 자기 곡은 RLS `auth.uid() = id` 분기로 계속 보임 |
| I-2 | API status 코드 drift — Design은 400, 구현은 409·410 사용 | `app/api/account/delete/route.ts:23` (409), `app/api/account/cancel-deletion/route.ts:15` (410) | REST 의미상 더 정확한 409/410 유지 + Design §4 갱신 |

### Minor

| # | Issue | 증거 |
|---|---|---|
| M-1 | cron 번들링 (Hobby 한도) — Design §11.1과 다름 | `cleanup-notifications/route.ts:9-12` |
| M-2 | placeholder `referral_code = 'deleted0'` (Design은 'deleted00') — 8자 패턴 일치 위한 의도된 변경 | `024:60` |
| M-3 | account_deletion_logs는 RLS `USING (false)` — 충분하지만 `REVOKE SELECT FROM authenticated` 추가하면 belt-and-suspenders | `024:27-30` |

---

## 5. Decision Record Verification

| Design 결정 | 구현 준수 | 비고 |
|---|---|---|
| Option C (service 단일 + 모달 단일) | ✅ | `services/account.service.ts` 단일, `AccountDeletionModal.tsx` stage state로 분기 |
| placeholder 고정 UUID | ✅ | `00000000-0000-0000-0000-000000000000` |
| 사유 로그 user_id 미저장 | ✅ | 스키마 차원 차단 |
| RLS 우선 + 명시 보조 | ✅ | `profiles_select` 갱신, songs/comments는 PostgREST embed 의존 (I-1 보완 필요) |
| Cron 매일 KST 03:00 | ⚠️ 번들 | Hobby 한도. 같은 시간대 유지 |
| 2단계 모달 단일 컴포넌트 + stage state | ✅ | stage 'confirm' / 'reason' |
| Stage 1 "계속" / Stage 2 "탈퇴하기" | ✅ | 텍스트 입력 없음 |
| referral 자동 무효화 | ✅ | redeem_referral 패치 |
| 자동 복원 (재로그인 트리거) | ✅ | AuthProvider SIGNED_IN 분기 |
| finalize는 cron만 service_role | ✅ | GRANT EXECUTE TO service_role |

---

## 6. Recommendation

1. **I-1 (Important) 즉시 패치 권장** — `profiles!fkey` → `profiles!fkey!inner`. 4 파일 1줄씩, 영향 contained. 패치 후 자기 라이브러리 정상 확인.
2. **I-2** — Design §4 status code를 409/410으로 갱신 (코드는 유지). REST 의미상 더 정확.
3. **M-1, M-2** — Design Decision Record에 #11 (cron bundling) 추가, §11.1 module-map 갱신.
4. **수동 QA** — Design §8.1 시나리오 (특히 탈퇴 후 다른 계정에서 검색·둘러보기로 노출 0건 확인, 7일+ cron 모의).

---

## 7. Post-Iteration Update (2026-06-09)

| 항목 | Before | After |
|---|---|---|
| FR-02 status | Partial | ✅ Met — 6 파일 `!inner` 적용 |
| Important gaps | 2 | 0 |
| Match Rate | 94% | **~98%** |
| Design §4 status codes | 400 (drift) | 409/410 명시 (Decision Record #12) |
| Design §10 Decision Records | 10 | 13 (#11~#13 추가) |
| 추가 신규 | — | `/farewell` 페이지 + 모달 리다이렉트 |

**`!inner` 적용 파일**:
- `services/explore.service.ts:84` (SONG_SELECT)
- `app/api/songs/[id]/comments/route.ts:28`
- `app/api/comments/[id]/route.ts:27`
- `app/api/comments/[id]/reply/route.ts:28`
- `services/notification.service.ts:20` (actor)
- `app/api/songs/[id]/share/route.ts:11` (SONG_SHARE_SELECT)

## 8. Post-QA Discovery (2026-06-09)

prod QA 직전 사용자 직감으로 발견된 일관성 결함:

| 시점 | songs.user_id | 노출 결과 (수정 전) |
|---|---|---|
| Day 0~6 (grace) | 탈퇴자 원본 ID | 프로필 RLS 차단 + `!inner` → **곡 사라짐** |
| Day 7+ (cron 이후) | placeholder | "(탈퇴한 회원)" 노출 |

운영정책 §7은 "공개 곡 익명화 후 **유지**" — grace 7일간 유지 위반.

### 해결 — Migration 025 (Option A 즉시 익명화)
- `songs.original_user_id` · `comments.original_user_id` 컬럼 추가
- `request_account_deletion`: 공개 곡·댓글 즉시 `user_id` → placeholder, `original_user_id`에 원본 백업
- `restore_account`: revert (user_id ← original_user_id)
- `finalize_account_deletion`: 공개 곡 추가 처리 불필요 (이미 placeholder). 비공개 곡 DELETE + 관계 정리만

### 결과
- Day 0부터 일관되게 "(탈퇴한 회원)" 노출 — 정책 §7 100% 일치
- 7일 내 복원: user_id 복귀 → 본인 라이브러리·공개 노출 모두 원상복구
- Decision Record #14 추가

## 9. Version History

| Version | Date | Author | Notes |
|---|---|---|---|
| 0.1 | 2026-06-09 | iamjinwang@gmail.com | Initial gap analysis. Match Rate 94%. 2 Important + 3 Minor 발견 |
| 0.2 | 2026-06-09 | iamjinwang@gmail.com | Important 2건 모두 수정. Match Rate ~98%. `/farewell` 페이지 추가 |
| 0.3 | 2026-06-09 | iamjinwang@gmail.com | Migration 025 — Option A 즉시 익명화. grace 일관성 결함 해소 |
