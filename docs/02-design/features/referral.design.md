# referral Design Document

> **Architecture**: Option C — Pragmatic Balance
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-08
> **Status**: Draft
> **Plan Ref**: `docs/01-plan/features/referral.plan.md`

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 결제 전 마지막 viral 채널 — 1차 무료 정책 강화 + 사용자 풀 확보 가속 |
| **WHO** | 만족도 높은 active user, 친구 추천으로 신뢰 확보된 신규 가입자 |
| **RISK** | 자기참조 abuse / 봇 / MiniMax 비용 폭증 / 기존 사용자 박탈감 |
| **SUCCESS** | referral 경유 가입 20%+, 1인당 평균 2~3명 초대, 보너스 받은 가입자 첫 곡 생성율 50%+ |
| **SCOPE** | DB 4컬럼 / 8자 code / redeem API / 더보기 모달 + Web Share / GA4 4 이벤트 / privacy 강화 |

---

## 1. Overview

친구 초대 시스템을 단일 `services/referral.service.ts` 안에 모든 비즈니스 로직 통합 (code 생성·redeem·anti-abuse). `credit.service.consume`만 분기 추가 (보너스 우선), AuthProvider는 `?ref=` sessionStorage 보존만. 마이그레이션 023으로 profiles에 4 컬럼 추가 + handle_new_user 트리거 확장.

---

## 2. Architecture (Option C)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Landing: modoomusic.com/?ref=abc12345                                 │
│   → AuthProvider.tsx: ?ref 감지 → sessionStorage('mono.referral.code')│
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓ user clicks 로그인 → OAuth
┌────────────────────────────────────────────────────────────────────────┐
│ OAuth callback (app/auth/callback/route.ts)                           │
│   - 세션 교환 후 referralService.redeemIfPending() 호출              │
│   - 실패해도 가입 흐름 차단 안 함 (try/catch)                         │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓
┌────────────────────────────────────────────────────────────────────────┐
│ POST /api/referral/redeem                                              │
│   → services/referral.service.ts                                       │
│      - validateCode(code): code 존재·소유자 본인 아님                 │
│      - checkAbuse(currentUserId, currentIp, ownerUserId)              │
│      - 양쪽 보너스 지급 (transaction)                                  │
│      - 초대자 count +1, 10명 이하면 +10cr                              │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓ 곡 생성 시
┌────────────────────────────────────────────────────────────────────────┐
│ services/credit.service.consume(userId, amount)                       │
│   1. SELECT bonus_credits, daily_credits FROM profiles                │
│   2. 보너스 우선 차감, 부족분만 일일에서                              │
│   3. UPDATE 두 컬럼 (transaction)                                      │
└────────────────────────────────────────────────────────────────────────┘
              │
              ↓ UI
┌────────────────────────────────────────────────────────────────────────┐
│ 더보기 메뉴 ("자주 묻는 질문" 위)                                     │
│   "친구 초대" → ReferralModal                                          │
│      - 링크: modoomusic.com/?ref={내 code}                             │
│      - 복사 버튼 + Web Share API (모바일)                              │
│      - 카운터 "3/10명 초대 · +30cr 받음"                               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Model

### 3.1 마이그레이션 023

```sql
-- 023_referral_system.sql

-- 1) profiles 컬럼 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referrer_bonus_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_credits integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS profiles_referral_code_idx ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON profiles(referred_by);

-- 2) referral_code 생성 함수 (8자 base36 alphanumeric)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempts integer := 0;
BEGIN
  LOOP
    -- 36진수 base 8자, lowercase+숫자
    candidate := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 5 THEN
      RAISE EXCEPTION 'referral_code generation failed after 5 attempts';
    END IF;
  END LOOP;
END;
$$;

-- 3) handle_new_user 트리거 확장 (기존 트리거 함수 patch)
-- 가입 시점에 referral_code 자동 부여 + referred_by는 NULL (redeem 시점에 설정)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, onboarding_done, referral_code)
  VALUES (
    NEW.id,
    -- 기존 username 생성 로직 그대로 (provider metadata에서)
    -- ... (실제 011 트리거 본문 복사)
    coalesce(NEW.raw_user_meta_data->>'preferred_username', 'user_' || substr(NEW.id::text, 1, 8)),
    coalesce(NEW.raw_user_meta_data->>'full_name', NULL),
    false,
    generate_referral_code()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4) 기존 사용자에게 referral_code 일괄 부여 (NULL인 경우만)
UPDATE profiles
SET referral_code = generate_referral_code()
WHERE referral_code IS NULL;

-- 5) referral_code NOT NULL 강제 (백필 후)
ALTER TABLE profiles ALTER COLUMN referral_code SET NOT NULL;

-- 6) RLS 정책: referral_code·referred_by·referrer_bonus_count·bonus_credits 본인만 select
-- (기존 profiles RLS가 public select라면 별도 처리 필요)
-- 가정: profiles SELECT가 이미 public read니 추가 정책 없음
```

### 3.2 referral_redemption 로그 (선택)

MVP는 profiles의 `referred_by`·`referrer_bonus_count`만으로 충분. 향후 분석 위해 별도 테이블 분리는 Phase 2.

---

## 4. API Contract

### 4.1 `POST /api/referral/redeem`

**Headers**: 인증 필요 (Supabase auth cookie)

**Body**:
```json
{ "code": "abc12345" }
```

**Response 200 (성공)**:
```json
{
  "data": {
    "owner_username": "alice",
    "bonus_credits": 10,
    "owner_bonus_added": true
  }
}
```

**Response 400**:
- `{ "error": "invalid_code" }` — 존재하지 않는 코드
- `{ "error": "self_referral" }` — 본인 코드
- `{ "error": "already_redeemed" }` — 이미 referred_by 채워짐
- `{ "error": "not_new_user" }` — 가입 60초 초과 (기존 사용자가 referral 받으려 시도)

**Response 429**:
- `{ "error": "abuse_blocked", "reason": "same_provider" }` — 같은 OAuth provider 2회 시도
- `{ "error": "abuse_blocked", "reason": "ip_quota" }` — 동일 IP 4건 초과

**구현 메모**:
- 인증된 사용자 (가입 직후 호출)
- `currentUserId` from session
- `currentIp` from `req.headers.get('x-forwarded-for') || req.ip`
- transaction (RPC 함수) 호출로 race condition 회피

### 4.2 RPC 함수 (Supabase)

```sql
CREATE OR REPLACE FUNCTION public.redeem_referral(
  invitee_id uuid,
  invitee_ip text,
  ref_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  owner_bonus_count integer;
  ip_count integer;
  provider_count integer;
  invitee_provider text;
  owner_bonus_added boolean := false;
BEGIN
  -- 1. 코드 검증
  SELECT id, referrer_bonus_count INTO owner_id, owner_bonus_count
  FROM profiles WHERE referral_code = ref_code;
  IF owner_id IS NULL THEN RETURN jsonb_build_object('error', 'invalid_code'); END IF;

  -- 2. 자기참조 차단
  IF owner_id = invitee_id THEN RETURN jsonb_build_object('error', 'self_referral'); END IF;

  -- 3. 이미 redeem 차단
  IF (SELECT referred_by FROM profiles WHERE id = invitee_id) IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_redeemed');
  END IF;

  -- 3.5. 신규 가입자만 허용 (auth.users.created_at < 60초)
  -- 기존 사용자가 referral 링크를 통해 로그인해서 양쪽 보너스 받는 abuse 차단
  -- AuthProvider의 isNewUser 로직과 동일 기준
  DECLARE invitee_created_at timestamptz;
  SELECT created_at INTO invitee_created_at FROM auth.users WHERE id = invitee_id;
  IF EXTRACT(EPOCH FROM (NOW() - invitee_created_at)) > 60 THEN
    RETURN jsonb_build_object('error', 'not_new_user');
  END IF;

  -- 4. Anti-abuse: 같은 owner를 referred_by로 가진 사용자 중
  --    동일 OAuth provider가 이미 있으면 차단
  SELECT raw_app_meta_data->>'provider' INTO invitee_provider
  FROM auth.users WHERE id = invitee_id;
  SELECT COUNT(*) INTO provider_count
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.referred_by = owner_id
    AND u.raw_app_meta_data->>'provider' = invitee_provider;
  IF provider_count > 0 THEN
    RETURN jsonb_build_object('error', 'abuse_blocked', 'reason', 'same_provider');
  END IF;

  -- 5. Anti-abuse: 동일 IP에서 4건 초과 (referred_by + ip 기록 필요)
  --    → ip는 profiles에 referred_from_ip 컬럼 추가 또는 별도 테이블
  --    MVP에선 ip는 profiles에 referred_from_ip로 저장
  SELECT COUNT(*) INTO ip_count
  FROM profiles WHERE referred_from_ip = invitee_ip;
  IF ip_count >= 4 THEN
    RETURN jsonb_build_object('error', 'abuse_blocked', 'reason', 'ip_quota');
  END IF;

  -- 6. invitee +10cr (bonus)
  UPDATE profiles
  SET bonus_credits = bonus_credits + 10,
      referred_by = owner_id,
      referred_from_ip = invitee_ip
  WHERE id = invitee_id;

  -- 7. owner: count +1, 10명 이하면 +10cr
  IF owner_bonus_count < 10 THEN
    UPDATE profiles
    SET bonus_credits = bonus_credits + 10,
        referrer_bonus_count = referrer_bonus_count + 1
    WHERE id = owner_id;
    owner_bonus_added := true;
  ELSE
    UPDATE profiles
    SET referrer_bonus_count = referrer_bonus_count + 1
    WHERE id = owner_id;
  END IF;

  RETURN jsonb_build_object(
    'owner_id', owner_id,
    'bonus_credits', 10,
    'owner_bonus_added', owner_bonus_added
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_referral TO authenticated;
```

### 4.3 referred_from_ip 추가

3.1 마이그레이션에 `referred_from_ip text` 컬럼 추가 (anti-abuse 용도).

---

## 5. UI / Component

### 5.1 ReferralModal

```tsx
'use client'
import { useState, useEffect } from 'react'
import { toast } from '@/components/toast/toast'
import { track, EVENTS } from '@/utils/analytics'

interface ReferralData {
  code: string
  count: number
  bonus_received: number
}

export function ReferralModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ReferralData | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/referral/me').then(r => r.json()).then(d => setData(d.data))
  }, [open])

  const link = data ? `https://modoomusic.com/?ref=${data.code}` : ''

  async function copy() {
    await navigator.clipboard.writeText(link)
    toast.success('초대 링크 복사됨')
    track(EVENTS.REFERRAL_SHARE, { method: 'copy' })
  }

  async function share() {
    if (!navigator.share) return copy()
    try {
      await navigator.share({
        title: 'MONO에서 같이 음악 만들어요',
        text: '친구 초대 링크로 가입하면 보너스 크레딧 10개 받아요',
        url: link,
      })
      track(EVENTS.REFERRAL_SHARE, { method: 'native_share' })
    } catch {
      // 취소
    }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl w-full max-w-[420px] p-6 shadow-2xl">
        {/* 헤더 + 닫기 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">친구 초대</h2>
            <p className="text-sm text-zinc-400 mt-1">초대된 친구당 10cr · 둘 다 받아요</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        {/* 카운터 */}
        {data && (
          <div className="mb-5 p-4 rounded-xl bg-white/[0.04] flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">초대 완료</p>
              <p className="text-2xl font-bold text-white mt-0.5">{data.count}<span className="text-base text-zinc-500">/10명</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">받은 보너스</p>
              <p className="text-2xl font-bold text-violet-400 mt-0.5">+{data.bonus_received}<span className="text-base text-zinc-500">cr</span></p>
            </div>
          </div>
        )}

        {/* 초대 링크 */}
        <div className="mb-4">
          <p className="text-xs text-zinc-400 mb-2">초대 링크</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={link}
              readOnly
              className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none"
            />
            <button
              onClick={copy}
              className="px-4 py-2.5 rounded-lg bg-white/[0.10] hover:bg-white/[0.18] text-sm font-medium text-white transition-colors"
            >
              복사
            </button>
          </div>
        </div>

        {/* Web Share API (모바일만 노출) */}
        <button
          onClick={share}
          className="md:hidden w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors"
        >
          공유하기
        </button>
      </div>
    </div>
  )
}
```

### 5.2 더보기 메뉴 통합

```tsx
// app/(main)/layout.tsx
const [referralOpen, setReferralOpen] = useState(false)
// ...
{/* 더보기 메뉴 안 */}
<button
  onClick={() => { setLegalMenuOpen(false); setReferralOpen(true) }}
  className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors border-b border-white/[0.06]"
>
  친구 초대
  <span className="text-xs text-violet-400 font-medium">+10cr</span>
</button>
{/* 자주 묻는 질문 (기존 비활성) */}
```

### 5.3 `GET /api/referral/me`

```ts
// app/api/referral/me/route.ts
export async function GET() {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data } = await supabase
    .from('profiles')
    .select('referral_code, referrer_bonus_count, bonus_credits')
    .eq('id', user.id)
    .single()
  return NextResponse.json({
    data: {
      code: data?.referral_code,
      count: data?.referrer_bonus_count ?? 0,
      bonus_received: Math.min(data?.referrer_bonus_count ?? 0, 10) * 10,  // 최대 10명까지만 보너스
    }
  })
}
```

---

## 6. State Management

| State | 위치 | 용도 |
|---|---|---|
| `sessionStorage('mono.referral.code')` | AuthProvider mount 시점 | OAuth callback까지 ref 보존 |
| `referralOpen` | layout.tsx | ReferralModal 토글 |
| `data` (code·count·bonus) | ReferralModal | 모달 열림 시 fetch |

Context 없음. modal 단일 토글만 layout state에 보유.

---

## 7. Implementation Details

### 7.1 AuthProvider — ref 보존

```tsx
// components/AuthProvider.tsx — useEffect 추가
useEffect(() => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const ref = url.searchParams.get('ref')
  if (ref && /^[a-z0-9]{8}$/.test(ref)) {
    sessionStorage.setItem('mono.referral.code', ref)
    // URL 정리 — UX
    url.searchParams.delete('ref')
    window.history.replaceState({}, '', url.toString())
  }
}, [])
```

### 7.2 OAuth callback — redeem 호출

```ts
// app/auth/callback/route.ts
// 세션 교환 성공 후
const refCode = ... // sessionStorage는 server에서 못 읽음 → 클라 측에서 처리해야

// 옵션 A: 클라 측에서 처리
// AuthProvider의 onAuthStateChange에서 SIGNED_IN 감지 → redeem 호출

// 옵션 B: OAuth callback URL에 ref 파라미터 동봉 (signInWithOAuth 호출 시)
```

**선택: Option B — `signInWithOAuth` 호출 시 query에 `ref` 동봉 → callback URL → server에서 처리**

```ts
// LoginModal에서
supabase.auth.signInWithOAuth({
  provider: 'kakao',
  options: {
    redirectTo: `/auth/callback?ref=${sessionStorage.getItem('mono.referral.code') ?? ''}`,
  },
})

// callback route
const ref = request.nextUrl.searchParams.get('ref')
if (ref && user) {
  await redeemReferral(user.id, ref, currentIp)
}
```

### 7.3 redeem 트리거 — 시점

```ts
// AuthProvider 안 onAuthStateChange에서
if (event === 'SIGNED_IN' && u) {
  const ref = sessionStorage.getItem('mono.referral.code')
  // isNewUser 가드: 가입 60초 이내만 — 기존 사용자 abuse 차단
  // AuthProvider의 sign_up/login 분기와 동일 기준
  const isNewUser = (Date.now() - new Date(u.created_at).getTime()) < 60_000

  if (ref && isNewUser) {
    fetch('/api/referral/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: ref }),
    }).then(r => r.json()).then(d => {
      sessionStorage.removeItem('mono.referral.code')
      if (d.data?.bonus_credits) {
        toast.success(`친구 초대 보너스 +${d.data.bonus_credits}cr 받았어요!`)
        track(EVENTS.REFERRAL_REDEEM_SUCCESS, { invitee_bonus: d.data.bonus_credits })
      } else if (d.error === 'abuse_blocked') {
        track(EVENTS.REFERRAL_ABUSE_BLOCKED, { reason: d.reason })
      }
    }).catch(() => {})
  } else if (ref && !isNewUser) {
    // 기존 사용자가 referral 링크 따라와서 로그인 — 보너스 무효, 정리만
    sessionStorage.removeItem('mono.referral.code')
    // (선택) toast.info('보너스는 신규 가입자만 받을 수 있어요')
  }
  // 기존 sign_up / login 트래킹...
}
```

### 7.4 credit.service consume 분기

```ts
// services/credit.service.ts
export async function consume(userId: string, amount: number): Promise<boolean> {
  const admin = createAdminClient()

  // 1. 잔액 조회
  const { data: profile } = await admin
    .from('profiles')
    .select('bonus_credits, daily_credits_remaining')  // 또는 기존 컬럼명
    .eq('id', userId)
    .single()
  if (!profile) return false

  const total = (profile.bonus_credits ?? 0) + (profile.daily_credits_remaining ?? 0)
  if (total < amount) return false

  // 2. 보너스 우선 차감
  const fromBonus = Math.min(profile.bonus_credits ?? 0, amount)
  const fromDaily = amount - fromBonus

  await admin
    .from('profiles')
    .update({
      bonus_credits: (profile.bonus_credits ?? 0) - fromBonus,
      daily_credits_remaining: (profile.daily_credits_remaining ?? 0) - fromDaily,
    })
    .eq('id', userId)

  return true
}
```

### 7.5 analytics.ts 이벤트 추가

```ts
export const EVENTS = {
  // ... 기존
  REFERRAL_SHARE: 'referral_share',
  REFERRAL_CLICK_IN: 'referral_click_in',
  REFERRAL_REDEEM_SUCCESS: 'referral_redeem_success',
  REFERRAL_ABUSE_BLOCKED: 'referral_abuse_blocked',
} as const
```

호출 위치:
- `referral_click_in`: AuthProvider mount, `?ref=` 감지 시
- `referral_share`: ReferralModal 복사·공유 버튼
- `referral_redeem_success`: callback redeem 성공 시
- `referral_abuse_blocked`: abuse 감지 시 (reason 포함)

---

## 8. Test Plan

### 8.1 수동 검증 체크리스트

- [ ] `?ref=abc12345` URL 진입 → sessionStorage에 보존됨, URL은 정리됨
- [ ] OAuth 4종 (Google·Kakao·Naver·Apple) 모두 ref 보존·redeem 성공
- [ ] 가입자: 보너스 +10cr 즉시 잔액 반영, 토스트 표시
- [ ] 초대자: 카운터 +1, 보너스 +10cr 잔액 반영 (다음 곡 생성 시 보너스 우선 차감)
- [ ] 11명째 초대 시: 카운터 +1, 보너스 0 (잔액 무변동)
- [ ] 자기 코드 redeem 시도 → 에러, 차단
- [ ] **기존 사용자가 referral 링크 따라와서 로그인 → 보너스 X (양쪽 모두), sessionStorage만 정리** ← 핵심 abuse 케이스
- [ ] 가입 60초 이내 신규 사용자 → 정상 redeem
- [ ] 같은 provider 2번 가입 → 차단
- [ ] 같은 IP에서 5번째 가입 → 차단
- [ ] 더보기 → "친구 초대" 모달 노출
- [ ] 링크 복사 동작
- [ ] 모바일에서 Web Share API native sheet
- [ ] GA4 DebugView에서 4 이벤트 발사 확인
- [ ] 빌드·lint·type-check 통과

### 8.2 보안 검증

- [ ] referral_code 추측 불가성 확인 (62^8 ≈ 218조)
- [ ] redeem 트랜잭션 race condition 회피 (RPC 함수로 단일 트랜잭션)
- [ ] consume이 bonus 음수 안 되는지 확인

---

## 9. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| 봇이 OAuth 자동화로 가입 | 이미 OAuth만 허용 (이메일 차단), provider별 1회 제한 |
| IP 4건 가족·공용 wifi 차단 | 4건이 합리적 균형. 5명 가족이라면 1명만 차단 |
| redeem race condition | RPC 함수로 single transaction |
| 초대자에 보너스 못 줘서 환불 못 받는 경우 | RPC가 모두 commit 또는 rollback, partial 상태 없음 |
| 사용자 sessionStorage 비활성화 | 옵션 B (callback URL 직접 동봉)로 보완 |
| consume이 두 컬럼 update race | RPC로 단일 트랜잭션 처리 권장 (현재는 sequential update — 향후 개선) |

---

## 10. Decision Records (11)

| # | 결정 | 근거 |
|---|---|---|
| 1 | Option C (Pragmatic) | service 단일화로 anti-abuse·redeem·code-gen 한 곳 집중 |
| 2 | 마이그레이션 023 (4 컬럼 + RPC 함수) | profiles 통합, 별도 테이블 불필요 (MVP 규모) |
| 3 | referral_code 8자 base36 lowercase | URL 친화·충돌 확률 미미 |
| 4 | 보너스 → 일일 순서 소진 | 사용자 체감 즉시 효과 |
| 5 | RPC 함수로 redeem (transaction) | race condition 차단 |
| 6 | sessionStorage + callback URL 동봉 (옵션 B) | OAuth 흐름에 안전 |
| 7 | Anti-abuse: provider별 1회 + IP 4건 상한 | 4인 가족까지 허용, 현실적 균형 |
| 8 | 11명째 보상 X, 카운터 +1 | 자랑·기여 동기 유지 |
| 9 | Context 없이 props·이벤트 | modal 단일 토글만 |
| 10 | Web Share API + 복사 (SDK 없이) | 모바일 native sheet 충분, 카카오 SDK 부담 회피 |
| **11** | **isNewUser 가드 (가입 60초 이내만 redeem)** | **기존 사용자가 referral 링크로 로그인해서 양쪽 보너스 받는 abuse 차단. AuthProvider의 sign_up/login 분기와 동일 기준** |

---

## 11. Implementation Guide

### 11.1 모듈 분할

| Module | 파일 | 변경 |
|---|---|---|
| `module-migration` | `supabase/migrations/023_referral_system.sql` | **신규** ~120 lines (4 컬럼·트리거·RPC) |
| `module-service` | `services/referral.service.ts` | **신규** ~80 lines (redeem 래퍼·getMyReferral·anti-abuse 보조) |
| `module-api-redeem` | `app/api/referral/redeem/route.ts` | **신규** ~30 lines |
| `module-api-me` | `app/api/referral/me/route.ts` | **신규** ~25 lines |
| `module-credit` | `services/credit.service.ts` | 수정 — consume에 bonus 우선 분기 (~15 lines) |
| `module-auth` | `components/AuthProvider.tsx` | 수정 — ref 보존 + redeem 트리거 (~30 lines) |
| `module-login-modal` | `components/LoginModal.tsx` | 수정 — OAuth `redirectTo`에 ref 동봉 (~10 lines) |
| `module-ui` | `components/ReferralModal.tsx` | **신규** ~150 lines |
| `module-integration` | `app/(main)/layout.tsx` | 더보기 메뉴 항목 + ReferralModal mount (~20 lines) |
| `module-analytics` | `utils/analytics.ts` | 4 이벤트 추가 (~5 lines) |
| `module-privacy` | `app/(legal)/privacy/page.tsx` | IP·디바이스 항목 강화 (~10 lines) |
| `module-qa` | (수동 QA) | DebugView·OAuth 4종 검증 |

### 11.2 구현 순서

1. **module-migration** (~30분): 023 작성 + SQL Editor 적용
2. **module-service** (~20분): referral.service.ts (redeem 래퍼·me·anti-abuse 보조)
3. **module-api-redeem** (~10분), **module-api-me** (~10분)
4. **module-credit** (~15분): consume 분기
5. **module-auth** (~25분), **module-login-modal** (~10분)
6. **module-ui** (~50분): ReferralModal
7. **module-integration** (~20분): 더보기 메뉴 항목 + modal mount
8. **module-analytics** (~5분)
9. **module-privacy** (~10분)
10. **module-qa** (~40분)

**총 예상**: ~4h (수동 QA 포함)

### 11.3 Session Guide

| Scope Key | 권장 묶음 | 예상 시간 |
|---|---|---|
| `module-migration,module-service,module-api-redeem,module-api-me,module-credit` | 백엔드 (~1.5h) | DB + service + API + credit |
| `module-auth,module-login-modal,module-ui,module-integration` | UI·통합 (~2h) | ref 보존 + 모달 + 더보기 |
| `module-analytics,module-privacy,module-qa` | 마무리·검증 (~1h) | 이벤트 + privacy + 수동 QA |

**단일 세션 권장 ~4h** 또는 **2 세션 분할** 가능 (백엔드 / UI+마무리).

---

## 12. Open Questions (Do 진입 전 확인)

1. **`auth.users.raw_app_meta_data->>'provider'` 신뢰성** — provider 값이 OAuth 종류와 정확히 매핑되는지 (Naver는 magiclink로 처리되므로 'email'로 올 수 있음 — Naver=Email 함정 [[feedback-code-pitfalls]])
2. **`credit.service` 현재 컬럼명** — `daily_credits_remaining`·`credits`·`monthly_credits` 등 실제 명칭 확인
3. **현재 `consume` 함수 구조** — 단일 함수인지 여러 곳에서 SQL 직접 호출인지
4. **`referred_from_ip` IPv6 대응** — text 타입이지만 길이 제한·정규화 필요 여부
5. **Supabase callback URL에 ref 동봉 동작 확인** — `redirectTo` query 파라미터가 4종 provider 모두에서 보존되는지

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-08 | Initial draft (Option C 선택, 4 결정 반영) | iamjinwang@gmail.com |
