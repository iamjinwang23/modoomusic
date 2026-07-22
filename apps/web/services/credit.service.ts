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
  bonus: number           // 무상 보너스 잔여
  paid: number            // 유상(구매) 잔여 — 무기한, 최후 소진
  total: number           // 일일 + 보너스 + 유상 합산 (사용 가능 총량)
  videoTrial: number      // 비디오 커버 무료 체험권 잔여 (mig 035) — 있으면 영상 무료
  resetAt: string
}

// 소진 내역 — 실패 환불 시 정확 복원용 (어느 버킷에서 얼마 빠졌는지)
export interface ConsumedBreakdown {
  bonus: number
  daily: number
  paid: number
}

export async function getCreditState(userId: string): Promise<CreditState> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('daily_credits_used, last_credit_reset_at, bonus_credits, paid_credits, is_admin, video_trial_remaining')
    .eq('id', userId)
    .maybeSingle()

  const limit = data?.is_admin ? ADMIN_DAILY_CREDITS : FREE_DAILY_CREDITS
  const todayStartUtc = kstTodayStartUtcIso()
  const lastReset = data?.last_credit_reset_at ?? null
  const needsReset = !lastReset || new Date(lastReset) < new Date(todayStartUtc)
  const bonus = (data?.bonus_credits as number | null) ?? 0
  const paid = (data?.paid_credits as number | null) ?? 0
  const videoTrial = (data?.video_trial_remaining as number | null) ?? 0

  if (needsReset && data) {
    await supabase
      .from('profiles')
      .update({ daily_credits_used: 0, last_credit_reset_at: todayStartUtc })
      .eq('id', userId)
    return {
      used: 0,
      limit,
      remaining: limit,
      bonus,
      paid,
      total: limit + bonus + paid,
      videoTrial,
      resetAt: nextKstMidnightIso(),
    }
  }

  const used = (data?.daily_credits_used as number | null) ?? 0
  const remaining = Math.max(0, limit - used)
  return {
    used,
    limit,
    remaining,
    bonus,
    paid,
    total: remaining + bonus + paid,
    videoTrial,
    resetAt: nextKstMidnightIso(),
  }
}

function nextKstMidnightIso(): string {
  const todayStart = new Date(kstTodayStartUtcIso())
  const nextMidnight = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  return nextMidnight.toISOString()
}

// Design Ref: §7.4 — 소진 순서 보너스 → 일일 → 유상(최후). 무상·소멸성 먼저, 구매분 마지막.
// 차감 시도: 가능하면 amount 차감하고 ok:true(+소진 내역), 부족하면 ok:false
export async function tryConsumeCredits(
  userId: string,
  amount: number,
): Promise<{ ok: boolean; state: CreditState; consumed?: ConsumedBreakdown }> {
  const state = await getCreditState(userId)
  if (state.total < amount) {
    return { ok: false, state }
  }

  const fromBonus = Math.min(state.bonus, amount)
  let rest = amount - fromBonus
  const fromDaily = Math.min(state.remaining, rest)
  rest -= fromDaily
  const fromPaid = rest // total >= amount 보장 → 남은 건 유상에서

  const supabase = createAdminClient()
  const nextBonus = state.bonus - fromBonus
  const nextUsed = state.used + fromDaily
  const nextPaid = state.paid - fromPaid

  const patch: Record<string, unknown> = { bonus_credits: nextBonus, daily_credits_used: nextUsed }
  if (fromPaid > 0) patch.paid_credits = nextPaid
  await supabase.from('profiles').update(patch).eq('id', userId)

  const nextRemaining = Math.max(0, state.limit - nextUsed)
  return {
    ok: true,
    consumed: { bonus: fromBonus, daily: fromDaily, paid: fromPaid },
    state: {
      ...state,
      used: nextUsed,
      remaining: nextRemaining,
      bonus: nextBonus,
      paid: nextPaid,
      total: nextRemaining + nextBonus + nextPaid,
    },
  }
}

// 차감 후 생성 실패 시 환불. consumed(소진 내역)를 주면 버킷별로 정확 복원(유상 포함),
// 없으면 레거시(일일 우선 복구, 유상 미복원).
export async function refundCredits(
  userId: string,
  amount: number,
  consumed?: ConsumedBreakdown,
): Promise<void> {
  const supabase = createAdminClient()
  const state = await getCreditState(userId)

  if (consumed) {
    await supabase
      .from('profiles')
      .update({
        daily_credits_used: Math.max(0, state.used - consumed.daily),
        bonus_credits: state.bonus + consumed.bonus,
      })
      .eq('id', userId)
    // 유상은 원자적 증가 RPC (mig 039)
    if (consumed.paid > 0) {
      await supabase.rpc('add_paid_credits', { p_user: userId, p_delta: consumed.paid })
    }
    return
  }

  // 레거시(내역 없음): 일일 사용분 우선 복구(보너스 보존이 호의적). 유상은 복원 안 함.
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

// Design Ref: video-cover §4.3 — 비디오 체험권 (크레딧과 분리)
// 잔량 1 이상이면 0으로 차감하고 true, 0이면 false. 동시성 안전(.gt 조건부 UPDATE).
export async function consumeVideoTrial(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({ video_trial_remaining: 0, video_trial_used_at: new Date().toISOString() })
    .eq('id', userId)
    .gt('video_trial_remaining', 0)
    .select('id')
    .maybeSingle()
  return !!data && !error
}

// 생성 실패 시 체험권 복원
export async function refundVideoTrial(userId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('profiles')
    .update({ video_trial_remaining: 1, video_trial_used_at: null })
    .eq('id', userId)
    .eq('video_trial_remaining', 0)
}
