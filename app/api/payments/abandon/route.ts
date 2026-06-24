// POST /api/payments/abandon — 결제창 취소/이탈 시 본인 ready 건을 실패 처리(목록 정리).
// ready만 전이(paid는 건드리지 않음). 늦은 Paid 웹훅이 오면 markPaymentPaidAndGrant가 다시 지급.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getPaymentRecord, markPaymentStatus } from '@/services/payment.service'

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
  if (rec.status === 'ready') await markPaymentStatus(paymentId, 'failed')

  return NextResponse.json({ ok: true })
}
