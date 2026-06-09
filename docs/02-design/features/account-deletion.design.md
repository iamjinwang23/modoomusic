# account-deletion Design Document

> **Architecture**: Option C — Pragmatic Balance
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-09
> **Status**: Draft
> **Plan Ref**: `docs/01-plan/features/account-deletion.plan.md`

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영정책 제7조 정립됐지만 인앱 기능 부재로 법적 결격·사용자 마찰. 결제 인프라 도입 전 마지막 정합성 정비 |
| **WHO** | 탈퇴 의사 있는 회원·실수 탈퇴자(grace 수혜)·제품 개선 위해 이탈 원인 분석할 운영자 |
| **RISK** | K-PIPA 부합·RLS 누락·친구 초대 코드 부정 사용·cron 실패 |
| **SUCCESS** | 인앱 탈퇴 정상 동작 / 7일 안 100% 복원 / 7일+ 운영정책 제7조 정확 적용 / 사유 통계 수집 |
| **SCOPE** | deleted_at + 사유 로그 + 2단계 모달 + soft delete RPC + cron + RLS + 운영정책 조항 |

---

## 1. Overview

회원 탈퇴를 단일 service(`services/account.service.ts`)로 통합. RPC 3개(`request_account_deletion`·`restore_account`·`finalize_account_deletion`)로 트랜잭션 안전 + 친구 초대 코드 자동 무효화. AuthProvider에서 SIGNED_IN 시 deleted_at 확인 → grace 내면 복원·외면 신규 흐름. 2단계 모달은 `AccountDeletionModal.tsx` 단일 컴포넌트의 stage state로 분기. Vercel Cron이 매일 KST 03:00에 7일+ 영구 파기 실행.

---

## 2. Architecture (Option C)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ProfileEditModal.tsx                                                   │
│   ├─ 하단 "회원 탈퇴" 링크 (조용한 회색)                              │
│   └─ 클릭 → setDeletionOpen(true)                                     │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓
┌────────────────────────────────────────────────────────────────────────┐
│ AccountDeletionModal.tsx (stage state: 'confirm' | 'reason')          │
│   Stage 1: 정책 요약 + 7일 grace 안내 + "계속"                        │
│   Stage 2: 라디오 5종 (필수) + 자유 텍스트(옵션, 200자) + "탈퇴하기"  │
│      ↓ POST /api/account/delete { reason_category, reason_text }      │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓
┌────────────────────────────────────────────────────────────────────────┐
│ services/account.service.ts                                            │
│   - requestDeletion(reason): RPC request_account_deletion             │
│   - restore(): RPC restore_account                                     │
│   - finalize(userIds[]): RPC finalize_account_deletion (cron만)       │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓
┌────────────────────────────────────────────────────────────────────────┐
│ DB Layer                                                                │
│   profiles.deleted_at + account_deletion_logs + 탈퇴자 placeholder   │
│   RPC: request_account_deletion (soft delete + 로그 + 코드 무효화)   │
│   RPC: restore_account (deleted_at = NULL)                            │
│   RPC: finalize_account_deletion (운영정책 §7 데이터 처리)            │
│   RLS: 핵심 SELECT에 deleted_at IS NULL 필터                          │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓ (cron 매일 KST 03:00)
┌────────────────────────────────────────────────────────────────────────┐
│ /api/cron/finalize-deletions                                           │
│   - SELECT id FROM profiles WHERE deleted_at < NOW() - INTERVAL '7d'  │
│   - 각 user에 대해 finalize_account_deletion RPC 호출                 │
│   - 마지막에 admin.deleteUser로 auth.users row 정리                   │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓ (재로그인 시)
┌────────────────────────────────────────────────────────────────────────┐
│ AuthProvider.tsx — onAuthStateChange SIGNED_IN                        │
│   if (profile.deleted_at && now - deleted_at < 7d) {                  │
│     restore_account RPC                                                │
│     toast '다시 오신 걸 환영해요. 계정이 복원되었어요'                 │
│   }                                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model

### 3.1 마이그레이션 024

```sql
-- 024_account_deletion.sql

-- 1) profiles에 deleted_at 컬럼
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- 2) 탈퇴 사유 로그 (개인 식별 정보 0)
CREATE TABLE IF NOT EXISTS account_deletion_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_category text NOT NULL CHECK (reason_category IN ('quality','no_ideas','switching','privacy','pause','other')),
  reason_text text CHECK (char_length(reason_text) <= 200),
  user_age_days integer,
  song_count integer,
  had_bonus_credits boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 3) 탈퇴자 placeholder profile (작성자 익명화용)
INSERT INTO profiles (id, username, display_name, onboarding_done, referral_code, bonus_credits, daily_credits_used)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'deleted_user',
  '(탈퇴한 회원)',
  true,
  'deleted00',  -- placeholder도 referral_code UNIQUE 필요
  0,
  0
)
ON CONFLICT (id) DO NOTHING;

-- 4) RPC: 탈퇴 요청 (soft delete + 사유 로그 + 친구 초대 코드 무효화)
CREATE OR REPLACE FUNCTION public.request_account_deletion(
  invoker_id uuid,
  reason_cat text,
  reason_txt text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_age int;
  song_cnt int;
  had_bonus boolean;
BEGIN
  -- 1. 이미 탈퇴 상태면 거부
  IF (SELECT deleted_at FROM profiles WHERE id = invoker_id) IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_deleted');
  END IF;

  -- 2. 통계 컨텍스트 수집 (개인 식별 정보 X)
  SELECT
    EXTRACT(DAY FROM NOW() - u.created_at)::int,
    p.song_count,
    COALESCE(p.bonus_credits, 0) > 0 OR COALESCE(p.referrer_bonus_count, 0) > 0
  INTO user_age, song_cnt, had_bonus
  FROM auth.users u
  JOIN profiles p ON p.id = u.id
  WHERE u.id = invoker_id;

  -- 3. 사유 로그 INSERT (user_id 미저장 — K-PIPA 안전)
  INSERT INTO account_deletion_logs (
    reason_category, reason_text, user_age_days, song_count, had_bonus_credits
  ) VALUES (
    reason_cat, NULLIF(TRIM(reason_txt), ''), user_age, song_cnt, had_bonus
  );

  -- 4. profiles.deleted_at 마킹 (soft delete)
  UPDATE profiles SET deleted_at = NOW() WHERE id = invoker_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5) RPC: 복원 (grace period 내)
CREATE OR REPLACE FUNCTION public.restore_account(invoker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_when timestamptz;
BEGIN
  SELECT deleted_at INTO deleted_when FROM profiles WHERE id = invoker_id;
  IF deleted_when IS NULL THEN
    RETURN jsonb_build_object('error', 'not_deleted');
  END IF;
  IF NOW() - deleted_when > INTERVAL '7 days' THEN
    RETURN jsonb_build_object('error', 'grace_period_expired');
  END IF;

  UPDATE profiles SET deleted_at = NULL WHERE id = invoker_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6) RPC: 영구 파기 (cron만 호출, 운영정책 §7 적용)
CREATE OR REPLACE FUNCTION public.finalize_account_deletion(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  placeholder_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- 0. grace period 검증 (방어적)
  IF (SELECT deleted_at FROM profiles WHERE id = target_id) IS NULL
     OR NOW() - (SELECT deleted_at FROM profiles WHERE id = target_id) < INTERVAL '7 days' THEN
    RETURN jsonb_build_object('error', 'not_eligible');
  END IF;

  -- 1. 공개 곡: 작성자 익명화 후 유지
  UPDATE songs SET user_id = placeholder_id
  WHERE user_id = target_id AND is_public = true;

  -- 2. 비공개 곡: 삭제
  DELETE FROM songs WHERE user_id = target_id AND is_public = false;

  -- 3. 본인 작성 댓글: 작성자 익명화 후 유지
  UPDATE comments SET user_id = placeholder_id WHERE user_id = target_id;

  -- 4. 좋아요·팔로우·컬렉션·알림: 즉시 파기
  DELETE FROM likes WHERE user_id = target_id;
  DELETE FROM follows WHERE follower_id = target_id OR following_id = target_id;
  DELETE FROM collections WHERE user_id = target_id;
  DELETE FROM notifications WHERE actor_id = target_id OR user_id = target_id;

  -- 5. 친구 초대 관계: 카운터는 placeholder로 익명화 유지
  -- referrer_bonus_count는 통계로 보존, referred_by 관계는 끊지 않음 (이미 placeholder가 owner되므로 자연스럽게 무효)
  UPDATE profiles SET referred_by = NULL WHERE referred_by = target_id;

  -- 6. profiles row 삭제 (placeholder 제외)
  DELETE FROM profiles WHERE id = target_id;

  -- 참고: auth.users는 API 라우트에서 admin.deleteUser로 별도 처리
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7) redeem_referral 패치: 탈퇴자 코드 차단
CREATE OR REPLACE FUNCTION public.redeem_referral(
  invitee_id uuid,
  invitee_ip text,
  ref_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
-- (기존 함수 본문 + owner.deleted_at IS NULL 체크 추가)
-- 변경 부분만 표시:
-- SELECT id, referrer_bonus_count, username INTO owner_id, ...
--   FROM profiles WHERE referral_code = ref_code AND deleted_at IS NULL;
$$;

-- 8) 공개 SELECT에 deleted_at 필터 (RLS) — 가장 중요한 곳만
-- profiles SELECT 정책 갱신, songs JOIN 시 profiles.deleted_at 필터링 등

GRANT EXECUTE ON FUNCTION public.request_account_deletion(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion(uuid) TO service_role;
```

### 3.2 RLS 정책 업데이트 (핵심 SELECT만)

```sql
-- profiles 공개 SELECT
DROP POLICY IF EXISTS profiles_select_public ON profiles;
CREATE POLICY profiles_select_public ON profiles FOR SELECT
USING (deleted_at IS NULL);

-- songs SELECT은 user_id가 placeholder로 바뀌면 자연 처리됨 (영구 파기 후)
-- soft delete 동안은 user_id가 그대로 → songs join에서 profiles.deleted_at 필터 필요
-- 둘러보기·검색·라이브러리에서 profiles inner join → RLS로 자동 차단
```

---

## 4. API Contract

### 4.1 `POST /api/account/delete`

**Headers**: 인증 필요

**Body**:
```json
{ "reason_category": "quality" | "no_ideas" | "switching" | "privacy" | "pause" | "other",
  "reason_text": "선택 자유 텍스트, 200자 이하" }
```

**Response 200**:
```json
{ "data": { "ok": true } }
```

**Response 400**:
- `{ "error": "invalid_reason" }` — 사유 카테고리 잘못된 값
- `{ "error": "bad_request" }` — 요청 본문 파싱 실패

**Response 401**: 비인증

**Response 409**: `{ "error": "already_deleted" }` — 이미 탈퇴 상태 (REST 의미상 conflict)

### 4.2 `POST /api/account/cancel-deletion`

**Headers**: 인증 필요

**Response 200**:
```json
{ "data": { "ok": true } }
```

**Response 400**: `{ "error": "not_deleted" }`

**Response 410**: `{ "error": "grace_period_expired" }` — grace 만료 (REST 의미상 gone)

### 4.3 `GET /api/cron/finalize-deletions`

**Headers**: `Authorization: Bearer ${CRON_SECRET}`

**Response 200**:
```json
{ "data": { "finalized": 3, "errors": 0 } }
```

흐름:
1. 7일+ 경과 profile id 조회
2. 각 id에 대해 `finalize_account_deletion` RPC + admin client의 `auth.admin.deleteUser`
3. 실패는 카운트만 하고 다음 id 진행 (다른 사용자 영향 없음)

---

## 5. UI / Component

### 5.1 ProfileEditModal — "회원 탈퇴" 링크 추가

모달 하단(저장 버튼 위 또는 footer)에 조용한 회색 링크:
```tsx
<button
  type="button"
  onClick={() => setDeletionOpen(true)}
  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
>
  회원 탈퇴
</button>
```

### 5.2 AccountDeletionModal (신규)

```tsx
'use client'
type Stage = 'confirm' | 'reason'

export function AccountDeletionModal({ open, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('confirm')
  const [reason, setReason] = useState<string>('quality')
  const [reasonText, setReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    const r = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason_category: reason, reason_text: reasonText.trim() }),
    })
    if (r.ok) {
      track(EVENTS.ACCOUNT_DELETION_REQUEST, { reason_category: reason })
      await supabase.auth.signOut()
      // 화면 새로고침 또는 root로 이동
    }
    setSubmitting(false)
  }

  if (!open) return null

  return (
    <Modal>
      {stage === 'confirm' ? (
        <ConfirmStage onContinue={() => setStage('reason')} onCancel={onClose} />
      ) : (
        <ReasonStage
          reason={reason} setReason={setReason}
          reasonText={reasonText} setReasonText={setReasonText}
          submitting={submitting}
          onBack={() => setStage('confirm')}
          onSubmit={handleSubmit}
        />
      )}
    </Modal>
  )
}
```

### 5.3 Stage 1 — ConfirmStage 내용

- 헤더: "정말 탈퇴하시겠습니까?"
- 본문: "탈퇴 후 7일간 같은 계정으로 다시 로그인하면 자동으로 복원됩니다. 7일이 지나면 모든 데이터가 운영정책에 따라 처리되며 되돌릴 수 없습니다."
- "운영정책 자세히 보기" → `/policy#section-7` (target=_blank)
- 버튼: "취소" / "계속"

### 5.4 Stage 2 — ReasonStage 내용

- 헤더: "탈퇴 사유를 알려주세요"
- 본문: "여러분의 의견은 서비스 개선에 큰 도움이 됩니다. 익명으로 통계 집계만 됩니다."
- 라디오 5종:
  - `quality` — AI 음악 품질이 만족스럽지 못해요
  - `no_ideas` — 만들 곡 아이디어가 더 떠오르지 않아요
  - `switching` — 다른 서비스를 사용하기로 했어요
  - `privacy` — 개인정보·계정 관리 차원에서
  - `pause` — 너무 자주 들어오게 돼서 잠시 끊고 싶어요
  - `other` — 기타
- 자유 텍스트: textarea, 200자 max, "기타 의견을 자유롭게 적어주세요 (선택)"
- 버튼: "뒤로" / "탈퇴하기"

### 5.5 AuthProvider 복원 흐름

```tsx
if (event === 'SIGNED_IN' && u) {
  // 기존 sign_up/login + referral redeem 분기
  // ...
  // 추가: deleted_at 확인 → grace 내면 자동 복원
  const { data: prof } = await supabase
    .from('profiles')
    .select('deleted_at')
    .eq('id', u.id)
    .maybeSingle()
  if (prof?.deleted_at) {
    const deletedMs = new Date(prof.deleted_at).getTime()
    const elapsed = Date.now() - deletedMs
    if (elapsed < 7 * 24 * 3600 * 1000) {
      const r = await fetch('/api/account/cancel-deletion', { method: 'POST' })
      if (r.ok) {
        toast.success('다시 오신 걸 환영해요. 계정이 복원되었어요')
        track(EVENTS.ACCOUNT_DELETION_RESTORED)
      }
    } else {
      // 7일 경과: 다음 cron이 정리. 그 사이 로그인 시도는 현재 데이터 없음 상태로 노출
      // 실제론 cron 전에 잡힐 수도 있으므로 안내 토스트 + signOut 처리 권장
      await supabase.auth.signOut()
      toast.info('탈퇴 후 일정 기간이 경과되어 데이터가 곧 정리됩니다')
    }
  }
}
```

---

## 6. State Management

| State | 위치 | 용도 |
|---|---|---|
| `deletionOpen` | ProfileEditModal | AccountDeletionModal 토글 |
| `stage` | AccountDeletionModal | 'confirm' \| 'reason' |
| `reason` / `reasonText` | AccountDeletionModal | 사유 입력 |
| `submitting` | AccountDeletionModal | 제출 중 버튼 비활성 |

Context·전역 상태 없음.

---

## 7. Implementation Details

### 7.1 service 함수 시그니처 (`services/account.service.ts`)

```ts
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type DeletionReason = 'quality' | 'no_ideas' | 'switching' | 'privacy' | 'pause' | 'other'

export async function requestDeletion(userId: string, reason: DeletionReason, reasonText: string)
export async function restoreAccount(userId: string)
export async function finalizeDeletions(): Promise<{ finalized: number; errors: number }>
```

### 7.2 Cron 라우트

```ts
// app/api/cron/finalize-deletions/route.ts
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await finalizeDeletions()
  return NextResponse.json({ data: result })
}
```

### 7.3 analytics 이벤트 추가

```ts
export const EVENTS = {
  // ...
  ACCOUNT_DELETION_REQUEST: 'account_deletion_request',
  ACCOUNT_DELETION_RESTORED: 'account_deletion_restored',
} as const
```

### 7.4 운영정책 제7조 patch

기존 표 아래 추가:
> ※ 회원 탈퇴 후 7일 이내에 동일한 OAuth 계정으로 다시 로그인하면 자동으로 탈퇴가 취소되고 모든 데이터가 복원됩니다. 7일이 경과하면 위 표에 명시된 데이터 처리 방식대로 영구 파기됩니다.

시행일 갱신: 2026-06-09.

### 7.5 FAQ 업데이트

`회원 탈퇴는 어떻게 하나요?` 답안 수정:
> 프로필 수정 → 하단 "회원 탈퇴" → 사유 선택 → "탈퇴하기"로 진행할 수 있어요. 탈퇴 후 7일 이내에 같은 계정으로 다시 로그인하면 자동으로 복원돼요. 7일이 경과하면 운영정책 제7조에 따라 영구 파기됩니다.

---

## 8. Test Plan

### 8.1 수동 검증

- [ ] 프로필 수정 모달 → "회원 탈퇴" 링크 노출
- [ ] Stage 1 → "계속" → Stage 2 진입
- [ ] 라디오 미선택 시 "탈퇴하기" 비활성 (또는 기본 선택)
- [ ] 탈퇴 성공 → signOut → 둘러보기로 이동
- [ ] DB 확인: `profiles.deleted_at` 채워짐, `account_deletion_logs`에 row 추가, user_id 없음 확인
- [ ] 곡·프로필 검색 → 탈퇴자 0건 노출 (RLS 동작)
- [ ] 친구 초대 코드 redeem 시도 → 탈퇴자 코드는 `invalid_code` 반환
- [ ] 같은 OAuth 재로그인(7일 내) → 자동 복원 토스트 + 데이터 복원
- [ ] 8일 경과 모의(deleted_at 수정) → cron 실행 → 운영정책 §7 데이터 처리 검증
- [ ] 공개 곡: user_id가 placeholder로 변경, 작성자 "(탈퇴한 회원)" 표시
- [ ] 비공개 곡: DELETE 완료
- [ ] 좋아요·팔로우·컬렉션·알림: 0건
- [ ] auth.users row 삭제 확인
- [ ] GA4 DebugView: `account_deletion_request`·`account_deletion_restored`

### 8.2 보안 검증

- [ ] 인증 없이 `/api/account/delete` → 401
- [ ] 잘못된 사유 카테고리 → 400
- [ ] cron 라우트 잘못된 secret → 401
- [ ] 사유 로그에 user_id 없음 (스키마 검증)

---

## 9. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| RLS 누락으로 탈퇴자 데이터 노출 | `profiles_select_public` 정책에 `deleted_at IS NULL` 강제. songs·comments는 profiles JOIN 시 자동 차단 |
| 친구 초대 코드 부정 사용 | `redeem_referral` RPC에 `owner.deleted_at IS NULL` 추가 |
| cron 실패가 일부 회원만 영향 | 사용자별 분리 트랜잭션 + try/catch → 다음 사용자 계속 진행 |
| 사유 로그 user_id 우연히 섞임 | INSERT 컬럼에 user_id 없음 (스키마 차원 차단) |
| Stage 2에서 "뒤로" 시 사유 초기화 우려 | state 유지 — 사용자가 의식적으로 다시 선택 가능 |
| 복원 후 데이터가 화면에 안 보일 가능성 | AuthProvider에서 `refreshProfile` 명시 호출 |
| auth.users 삭제 실패 시 본 row만 남는 inconsistency | finalize RPC + admin.deleteUser 순차 처리, 둘 다 try/catch |

---

## 10. Decision Records (13)

| # | 결정 | 근거 |
|---|---|---|
| 1 | Option C (Pragmatic) | service 단일 + 모달 단일 (stage state) |
| 2 | placeholder 고정 UUID | FK 유지 + 디스플레이 단순 (Plan §7 결정) |
| 3 | 사유 로그 user_id 미저장 | K-PIPA 안전 (Plan §7 결정) |
| 4 | RLS 우선 + 명시 보조 | 누락 위험 최소화 |
| 5 | Cron 매일 KST 03:00 | 다른 cron(notifications cleanup)과 동일 |
| 6 | 2단계 모달 단일 컴포넌트 + stage state | 단순·재사용 적음 |
| 7 | Stage 1 "계속" / Stage 2 "탈퇴하기" CTA | 사용자 명시·텍스트 입력 X |
| 8 | 친구 초대 코드 자동 무효화 | redeem_referral에 deleted_at 추가 |
| 9 | 복원은 자동 (재로그인 트리거) | UX 마찰 최소화 |
| 10 | finalize는 cron만 service_role 권한 | 사용자가 직접 영구 파기 못함 (실수 방지) |
| 11 | **cron 번들링** — 별도 등록 대신 `cleanup-notifications`에 통합 | Vercel Hobby 2 cron 한도. 시간대(KST 03:00) 동일 유지 |
| 12 | **REST 의미상 status code** — 400 대신 409 (already_deleted) · 410 (grace_period_expired) | 자원 상태 충돌·소실을 더 정확히 표현. 클라이언트는 `!r.ok` 분기로 안전 |
| 13 | **공개 SELECT은 `profiles!fkey!inner` 강제** | FR-02 보장. PostgREST embed는 LEFT OUTER 기본이라 탈퇴자 행이 author=null로 노출됨. RLS는 본인 자기 곡은 계속 보여주므로 라이브러리 영향 없음 |
| **14** | **Option A — 즉시 익명화 (migration 025)** | 운영정책 §7 "공개 곡 익명화 후 유지"와 grace 동작 일관성. 기존(024): grace 7일간 곡 사라짐 → cron 후 익명 노출. 변경(025): 탈퇴 시점 즉시 `user_id` → placeholder + `original_user_id`에 원본 백업 → Day 0부터 "(탈퇴한 회원)" 노출. 복원 시 user_id revert. |

---

## 11. Implementation Guide

### 11.1 모듈 분할

| Module | 파일 | 변경 |
|---|---|---|
| `module-migration` | `supabase/migrations/024_account_deletion.sql` | **신규** ~200 lines |
| `module-service` | `services/account.service.ts` | **신규** ~60 lines |
| `module-api-delete` | `app/api/account/delete/route.ts` | **신규** ~35 lines |
| `module-api-cancel` | `app/api/account/cancel-deletion/route.ts` | **신규** ~25 lines |
| `module-cron` | `app/api/cron/finalize-deletions/route.ts` | **신규** ~50 lines |
| `module-modal` | `components/AccountDeletionModal.tsx` | **신규** ~200 lines |
| `module-profile-edit` | `components/ProfileEditModal.tsx` | 하단 "회원 탈퇴" 링크 + 모달 mount |
| `module-auth` | `components/AuthProvider.tsx` | SIGNED_IN 시 deleted_at 확인·자동 복원 |
| `module-referral-patch` | 마이그레이션 안에 포함 (`redeem_referral` 갱신) | 마이그레이션 |
| `module-policy` | `app/(legal)/policy/page.tsx` | 제7조에 grace period 조항 추가 + 시행일 |
| `module-faq` | `app/(legal)/faq/page.tsx` | 탈퇴 답안 갱신 |
| `module-analytics` | `utils/analytics.ts` | 2 이벤트 추가 |
| `module-qa` | (수동 QA) | 시나리오 검증 |

### 11.2 구현 순서

1. **module-migration** (~40분): 024 작성 + SQL Editor 적용 + 검증 쿼리
2. **module-service** (~15분)
3. **module-api-delete**·**module-api-cancel** (~15분)
4. **module-cron** (~20분)
5. **module-modal** (~50분): 2 stage 단일 컴포넌트
6. **module-profile-edit** (~10분): 링크 + mount
7. **module-auth** (~20분): 복원 분기
8. **module-policy**·**module-faq** (~15분)
9. **module-analytics** (~3분)
10. **Vercel Cron 등록**: 매일 KST 03:00에 `/api/cron/finalize-deletions` 호출
11. **module-qa** (~40분)

**총 예상**: ~4~5h

### 11.3 Session Guide

| Scope Key | 권장 묶음 | 예상 시간 |
|---|---|---|
| `module-migration,module-service,module-api-delete,module-api-cancel,module-cron` | 백엔드 | ~1.5h |
| `module-modal,module-profile-edit,module-auth` | UI·통합 | ~1.5h |
| `module-policy,module-faq,module-analytics,module-qa` | 마무리·검증 | ~1h |

**단일 세션 ~4~5h** 권장.

---

## 12. Open Questions (Do 진입 전 확인)

1. **profiles RLS 정책 현재 상태** — `deleted_at IS NULL` 추가 시 영향 받는 다른 정책 있는지 검토
2. **songs SELECT 시 profile JOIN 패턴** — inner join이면 RLS 자동, 별도 select라면 명시 필터 필요. `SONG_SELECT` 상수 검토
3. **comments SELECT 패턴** — 동일
4. **Vercel Cron 등록 방법** — vercel.json 사용 중인지 또는 Vercel UI 직접 등록인지 확인
5. **현재 알림(notifications) 정리 cron 시간** — 같은 KST 03:00이면 충돌 회피 (5분 차이 권장)
6. **placeholder profile의 referral_code 충돌** — `deleted00`이 generate_referral_code 패턴(소문자 alnum)과 충돌하지 않는지

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-09 | Initial draft, Option C 선택, 7일 grace + 사유 수집 확정 | iamjinwang@gmail.com |
