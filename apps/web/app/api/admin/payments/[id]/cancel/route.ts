// POST /api/admin/payments/[id]/cancel — 어드민 결제 취소(환불) + 크레딧 회수 + 감사 로그.
//   mode=normal       : 미사용분 비례 환불 (사용분은 환불 제외) — 약관 제12조
//   mode=company_fault : 회사 귀책·서비스 하자 → 전액 환불(사용분 포함)
// PortOne 취소 성공 시에만 회수. 웹훅(Transaction.Cancelled)이 안전망(멱등).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { withAudit, AuditError } from '@/services/admin.service'
import { cancelPortonePayment } from '@/lib/portone'
import { getPaymentRecord, markPaymentCancelledAndRevoke } from '@/services/payment.service'
import { getCreditState } from '@/services/credit.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('payments')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: paymentId } = await params

  let body: { reason?: unknown; mode?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
  const mode = body.mode === 'company_fault' ? 'company_fault' : 'normal'

  const rec = await getPaymentRecord(paymentId)
  if (!rec) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (rec.status !== 'paid') return NextResponse.json({ error: 'not_cancellable', status: rec.status }, { status: 400 })

  // 미사용분 산정 — 풀(pool) 잔액 기준. unused = min(이 건 크레딧, 현재 유상잔액)
  const state = await getCreditState(rec.userId)
  const unused = Math.max(0, Math.min(rec.credits, state.paid))
  const used = rec.credits - unused

  // 환불액·회수량 계산
  let refundAmount: number
  if (mode === 'company_fault') {
    refundAmount = rec.amount // 전액
  } else {
    // 비례: 결제액 × 미사용/총 (원 단위 반올림). 사용분은 환불 제외.
    refundAmount = Math.round(rec.amount * unused / rec.credits)
  }
  const revokeCredits = unused // 사용분은 회수 불가 — 미사용분만 회수

  if (refundAmount <= 0) {
    return NextResponse.json({ error: 'nothing_refundable', used, unused }, { status: 400 })
  }

  // 1) PortOne 취소(환불) — 전액이면 amount 생략, 부분이면 amount 지정
  const isFull = refundAmount >= rec.amount
  const cancel = await cancelPortonePayment(paymentId, reason, isFull ? undefined : refundAmount)
  if (!cancel.ok) return NextResponse.json({ error: 'pg_cancel_failed', detail: cancel.error }, { status: 502 })

  // 2) 크레딧 회수 + 상태 전이(멱등) + 감사 로그
  let revoked = false
  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'cancel_payment',
        targetType: 'payment',
        targetId: paymentId,
        reason,
        payload: { mode, amount: rec.amount, refundAmount, credits: rec.credits, used, revokeCredits, userId: rec.userId },
      },
      async () => {
        const r = await markPaymentCancelledAndRevoke({ paymentId, revokeCredits, refundedCredits: revokeCredits })
        revoked = r.revoked
      },
    )
  } catch (e) {
    if (e instanceof AuditError && e.code === 'reason_too_short') {
      return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
    }
    console.error('[admin cancel payment] 회수/감사 실패:', e)
  }

  return NextResponse.json({ ok: true, revoked, mode, refundAmount, revokeCredits, used })
}
