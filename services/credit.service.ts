import { createClient } from '@/lib/supabase/server'

// 1차(Free Only) 정책: 일 10크레딧, KST 자정 리셋, 이월 X
export const FREE_DAILY_CREDITS = 10

// KST(=UTC+9) 기준 오늘 0시 0분 0초 (UTC ISO 문자열)
function kstTodayStartUtcIso(): string {
  const now = new Date()
  // 현재 UTC 시각에 +9h 더해서 KST 시각으로 본 다음, 그 날짜의 0시(KST)를 다시 UTC로 환산
  const kstNowMs = now.getTime() + 9 * 60 * 60 * 1000
  const kstNow = new Date(kstNowMs)
  // KST 자정 = KST 00:00:00 → UTC로는 전날 15:00:00
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
  remaining: number
  resetAt: string  // 다음 리셋 시점(ISO)
}

export async function getCreditState(userId: string): Promise<CreditState> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('daily_credits_used, last_credit_reset_at')
    .eq('id', userId)
    .maybeSingle()

  const todayStartUtc = kstTodayStartUtcIso()
  const lastReset = data?.last_credit_reset_at ?? null
  const needsReset = !lastReset || new Date(lastReset) < new Date(todayStartUtc)

  if (needsReset && data) {
    await supabase
      .from('profiles')
      .update({ daily_credits_used: 0, last_credit_reset_at: todayStartUtc })
      .eq('id', userId)
    return { used: 0, limit: FREE_DAILY_CREDITS, remaining: FREE_DAILY_CREDITS, resetAt: nextKstMidnightIso() }
  }

  const used = data?.daily_credits_used ?? 0
  return {
    used,
    limit: FREE_DAILY_CREDITS,
    remaining: Math.max(0, FREE_DAILY_CREDITS - used),
    resetAt: nextKstMidnightIso(),
  }
}

function nextKstMidnightIso(): string {
  const todayStart = new Date(kstTodayStartUtcIso())
  const nextMidnight = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  return nextMidnight.toISOString()
}

// 차감 시도: 가능하면 used += amount하고 ok:true, 부족하면 ok:false
export async function tryConsumeCredits(userId: string, amount: number): Promise<{ ok: boolean; state: CreditState }> {
  const state = await getCreditState(userId)
  if (state.remaining < amount) {
    return { ok: false, state }
  }
  const supabase = await createClient()
  const nextUsed = state.used + amount
  await supabase
    .from('profiles')
    .update({ daily_credits_used: nextUsed })
    .eq('id', userId)
  return {
    ok: true,
    state: { ...state, used: nextUsed, remaining: state.limit - nextUsed },
  }
}

// 차감 후 생성 실패 시 환불
export async function refundCredits(userId: string, amount: number): Promise<void> {
  const state = await getCreditState(userId)
  const supabase = await createClient()
  await supabase
    .from('profiles')
    .update({ daily_credits_used: Math.max(0, state.used - amount) })
    .eq('id', userId)
}

