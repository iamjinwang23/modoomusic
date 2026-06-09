import { createAdminClient } from '@/lib/supabase/admin'

// userId를 명시 인자로 받으므로 admin 클라이언트로 안전하게 호출 (RLS 무관, 쿠키 의존 없음).
// waitUntil 백그라운드 작업에서도 쿠키 만료 걱정 없이 동작.

// 1차(Free Only) 정책: 일 10크레딧, KST 자정 리셋, 이월 X
// Design Ref: referral §6.4 — bonus_credits 별도 컬럼, 보너스 → 일일 순서 소진
// 관리자(profiles.is_admin = true)는 일 100크레딧으로 분기 (mig 027)
export const FREE_DAILY_CREDITS = 10
export const ADMIN_DAILY_CREDITS = 100

// KST(=UTC+9) 기준 오늘 0시 0분 0초 (UTC ISO 문자열)
function kstTodayStartUtcIso(): string {
  const now = new Date()
  const kstNowMs = now.getTime() + 9 * 60 * 60 * 1000
  const kstNow = new Date(kstNowMs)
  const kstMidnightUtcMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  ) - 9 * 60 * 60 * 1000
  return new Date(kstMidnightUtcMs).toISOString()
}

export interface CreditState {
  used: number
  limit: number
  remaining: number       // 일일 잔여 (일일 한도 - 사용)
  bonus: number           // 보너스 잔여
  total: number           // 일일 + 보너스 합산 (사용 가능 총량)
  resetAt: string
}

export async function getCreditState(userId: string): Promise<CreditState> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('daily_credits_used, last_credit_reset_at, bonus_credits, is_admin')
    .eq('id', userId)
    .maybeSingle()

  const limit = data?.is_admin ? ADMIN_DAILY_CREDITS : FREE_DAILY_CREDITS
  const todayStartUtc = kstTodayStartUtcIso()
  const lastReset = data?.last_credit_reset_at ?? null
  const needsReset = !lastReset || new Date(lastReset) < new Date(todayStartUtc)

  if (needsReset && data) {
    await supabase
      .from('profiles')
      .update({ daily_credits_used: 0, last_credit_reset_at: todayStartUtc })
      .eq('id', userId)
    const bonus = (data?.bonus_credits as number | null) ?? 0
    return {
      used: 0,
      limit,
      remaining: limit,
      bonus,
      total: limit + bonus,
      resetAt: nextKstMidnightIso(),
    }
  }

  const used = (data?.daily_credits_used as number | null) ?? 0
  const bonus = (data?.bonus_credits as number | null) ?? 0
  const remaining = Math.max(0, limit - used)
  return {
    used,
    limit,
    remaining,
    bonus,
    total: remaining + bonus,
    resetAt: nextKstMidnightIso(),
  }
}

function nextKstMidnightIso(): string {
  const todayStart = new Date(kstTodayStartUtcIso())
  const nextMidnight = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  return nextMidnight.toISOString()
}

// Design Ref: §7.4 — 보너스 우선 → 일일 순서 차감
// 차감 시도: 가능하면 amount 차감하고 ok:true, 부족하면 ok:false
export async function tryConsumeCredits(userId: string, amount: number): Promise<{ ok: boolean; state: CreditState }> {
  const state = await getCreditState(userId)
  if (state.total < amount) {
    return { ok: false, state }
  }

  const fromBonus = Math.min(state.bonus, amount)
  const fromDaily = amount - fromBonus

  const supabase = createAdminClient()
  const nextBonus = state.bonus - fromBonus
  const nextUsed = state.used + fromDaily

  await supabase
    .from('profiles')
    .update({
      bonus_credits: nextBonus,
      daily_credits_used: nextUsed,
    })
    .eq('id', userId)

  const nextRemaining = Math.max(0, state.limit - nextUsed)
  return {
    ok: true,
    state: {
      ...state,
      used: nextUsed,
      remaining: nextRemaining,
      bonus: nextBonus,
      total: nextRemaining + nextBonus,
    },
  }
}

// Design Ref: §7.4 — 환불은 보너스 → 일일 역순 (소진 우선순위 반대)
// 차감 후 생성 실패 시 환불
export async function refundCredits(userId: string, amount: number): Promise<void> {
  const state = await getCreditState(userId)
  const supabase = createAdminClient()

  // 일일 사용분에서 먼저 복구 (사용자 체감: 보너스가 보존되는 것이 더 호의적)
  const fromDaily = Math.min(state.used, amount)
  const fromBonus = amount - fromDaily

  await supabase
    .from('profiles')
    .update({
      daily_credits_used: Math.max(0, state.used - fromDaily),
      bonus_credits: state.bonus + fromBonus,
    })
    .eq('id', userId)
}
