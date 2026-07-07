// Design Ref: referral §7 — referral 단일 service (Option C)
// redeem 래퍼 + getMyReferral 조회. anti-abuse·transaction은 모두 RPC에서 처리.

import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type RedeemErrorCode =
  | 'invalid_code'
  | 'self_referral'
  | 'already_redeemed'
  | 'not_new_user'
  | 'abuse_blocked'

export interface RedeemSuccess {
  ownerUsername: string
  bonusCredits: number
  ownerBonusAdded: boolean
}

export interface RedeemFailure {
  error: RedeemErrorCode
  reason?: 'same_provider' | 'ip_quota'
}

export interface MyReferral {
  code: string
  count: number
  bonusReceived: number
}

// Design Ref: §4.2 — RPC 단일 트랜잭션. invitee_ip는 라우트에서 추출
export async function redeemReferral(
  inviteeId: string,
  inviteeIp: string,
  refCode: string,
): Promise<RedeemSuccess | RedeemFailure> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('redeem_referral', {
    invitee_id: inviteeId,
    invitee_ip: inviteeIp,
    ref_code: refCode,
  })
  if (error) {
    console.error('[referral.redeem]', error.message)
    return { error: 'invalid_code' }
  }
  const r = data as Record<string, unknown>
  if (r.error) {
    return {
      error: r.error as RedeemErrorCode,
      reason: r.reason as 'same_provider' | 'ip_quota' | undefined,
    }
  }
  return {
    ownerUsername: r.owner_username as string,
    bonusCredits: r.bonus_credits as number,
    ownerBonusAdded: r.owner_bonus_added as boolean,
  }
}

// 내 referral 정보 (모달 표시용)
export async function getMyReferral(userId: string): Promise<MyReferral | null> {
  const supabase = await createUserClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('referral_code, referrer_bonus_count')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  const count = (data.referrer_bonus_count as number | null) ?? 0
  return {
    code: data.referral_code as string,
    count,
    bonusReceived: Math.min(count, 10) * 10,  // 10명 이하 보상만 누적
  }
}
