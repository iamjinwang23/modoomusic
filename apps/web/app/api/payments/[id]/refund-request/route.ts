// POST /api/payments/[id]/refund-request — 사용자 환불 신청 (어드민이 검토 후 처리)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { requestRefund } from '@/services/payment.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: paymentId } = await params
  let body: { reason?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  const result = await requestRefund(user.id, paymentId, reason)
  if (!result.ok) {
    const status = result.error === 'not_eligible' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
