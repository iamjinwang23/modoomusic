// POST /api/payments/verify — 결제 후 서버 검증 + 크레딧 지급.
// PortOne 결제 단건을 조회해 status=PAID & 금액 일치 확인 후 멱등 지급.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getPortonePayment } from '@/lib/portone'
import { getPaymentRecord, markPaymentPaidAndGrant, markPaymentStatus } from '@/services/payment.service'
import { getCreditState } from '@/services/credit.service'

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { paymentId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId : ''
  if (!paymentId) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  const rec = await getPaymentRecord(paymentId)
  if (!rec || rec.userId !== user.id) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 이미 지급됨 (웹훅이 먼저 처리한 경우 등) — 멱등 성공 응답
  if (rec.status === 'paid') {
    const state = await getCreditState(user.id)
    return NextResponse.json({ ok: true, granted: false, credits: rec.credits, creditState: state })
  }

  const pay = await getPortonePayment(paymentId)
  if (!pay) return NextResponse.json({ error: 'verify_failed' }, { status: 502 })

  // 미완료(대기/실패) — 지급 안 함
  if (pay.status !== 'PAID') {
    return NextResponse.json({ ok: false, status: pay.status }, { status: 400 })
  }
  // 금액 위변조 방지 — 서버 기록 금액과 대조
  if (pay.amount?.total !== rec.amount) {
    await markPaymentStatus(paymentId, 'failed', pay)
    return NextResponse.json({ error: 'amount_mismatch' }, { status: 400 })
  }

  const grant = await markPaymentPaidAndGrant({
    paymentId,
    pgTxId: typeof pay.transactionId === 'string' ? pay.transactionId : null,
    raw: pay,
  })
  const state = await getCreditState(user.id)
  return NextResponse.json({ ok: true, granted: grant.granted, credits: grant.credits, creditState: state })
}
