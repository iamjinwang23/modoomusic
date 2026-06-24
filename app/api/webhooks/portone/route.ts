// POST /api/webhooks/portone — PortOne 웹훅 (서버검증과 이중 안전장치).
// 서명 검증(@portone/server-sdk) → Transaction.Paid면 결제 재조회·금액대조 후 멱등 지급.
import { NextRequest, NextResponse } from 'next/server'
import * as PortOne from '@portone/server-sdk'
import { getPortonePayment } from '@/lib/portone'
import { getPaymentRecord, markPaymentPaidAndGrant, markPaymentStatus, markPaymentCancelledAndRevoke } from '@/services/payment.service'

export async function POST(req: NextRequest) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook portone] PORTONE_WEBHOOK_SECRET 미설정')
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  const bodyText = await req.text()
  const headers = Object.fromEntries(req.headers.entries())

  let webhook: Awaited<ReturnType<typeof PortOne.Webhook.verify>>
  try {
    webhook = await PortOne.Webhook.verify(secret, bodyText, headers)
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  // 결제 완료 이벤트만 처리. paymentId로 재조회·금액대조 후 지급(멱등).
  const evt = webhook as { type?: string; data?: { paymentId?: string } }
  const paymentId = evt.data?.paymentId
  if (paymentId && evt.type === 'Transaction.Paid') {
    const rec = await getPaymentRecord(paymentId)
    if (rec && rec.status !== 'paid') {
      const pay = await getPortonePayment(paymentId)
      if (pay && pay.status === 'PAID' && pay.amount?.total === rec.amount) {
        await markPaymentPaidAndGrant({
          paymentId,
          pgTxId: typeof pay.transactionId === 'string' ? pay.transactionId : null,
          raw: pay,
        })
      }
    }
  } else if (paymentId && evt.type === 'Transaction.Cancelled') {
    // 관리자/카드사 취소 등 — 지급됐던 크레딧 회수(멱등 안전망)
    await markPaymentCancelledAndRevoke({ paymentId, raw: webhook })
  } else if (paymentId && evt.type === 'Transaction.Failed') {
    await markPaymentStatus(paymentId, 'failed', webhook)
  }

  // 항상 200 — 재시도 폭주 방지(처리 못한 이벤트는 무시)
  return NextResponse.json({ ok: true })
}
