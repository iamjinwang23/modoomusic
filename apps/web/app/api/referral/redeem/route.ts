// Design Ref: referral §4.1 — POST /api/referral/redeem
// 인증 필요, IP는 x-forwarded-for / x-real-ip / fallback

import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { redeemReferral } from '@/services/referral.service'

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return '0.0.0.0'
}

export async function POST(req: NextRequest) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { code?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : ''
  if (!/^[a-z0-9]{8}$/.test(code)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 })
  }

  const ip = getClientIp(req)
  const result = await redeemReferral(user.id, ip, code)

  if ('error' in result) {
    const status = result.error === 'abuse_blocked' ? 429 : 400
    return NextResponse.json({ error: result.error, reason: result.reason }, { status })
  }

  return NextResponse.json({
    data: {
      owner_username: result.ownerUsername,
      bonus_credits: result.bonusCredits,
      owner_bonus_added: result.ownerBonusAdded,
    },
  })
}
