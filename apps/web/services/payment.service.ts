// 결제(PortOne) — 크레딧 단건 구매. payments 기록 + 멱등 지급.
// 구독(빌링키)은 추후. 상품 카탈로그는 lib/credit-products(서버·클라 공용).
import { createAdminClient } from '@/lib/supabase/admin'
import { getPortonePayment } from '@/lib/portone'
import { type CreditProduct } from '@/lib/credit-products'

export { CREDIT_PRODUCTS, getCreditProduct, type CreditProduct } from '@/lib/credit-products'

// 결제 준비: payments에 ready 행 INSERT 후 결제창에 넘길 값 반환.
// paymentId는 서버 생성(멱등키). 금액·크레딧은 상품 상수 스냅샷(클라 금액 신뢰 X).
export async function createPaymentRecord(
  userId: string,
  product: CreditProduct,
): Promise<{ paymentId: string } | null> {
  const admin = createAdminClient()
  // 이니시스 oid 제한(1~40자) — 'pay_' + uuid(하이픈 제거 32자) = 36자
  const paymentId = `pay_${crypto.randomUUID().replace(/-/g, '')}`
  const { error } = await admin.from('payments').insert({
    payment_id: paymentId,
    user_id: userId,
    product_code: product.code,
    order_name: product.orderName,
    amount: product.amount,
    credits: product.credits,
    status: 'ready',
  })
  if (error) {
    console.error('[payment.createPaymentRecord]', error.message)
    return null
  }
  return { paymentId }
}

export interface PaymentRecord {
  paymentId: string
  userId: string
  amount: number
  credits: number
  status: string
}

// payments 행 조회 (서버검증·웹훅에서 금액 대조용)
export async function getPaymentRecord(paymentId: string): Promise<PaymentRecord | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('payments')
    .select('payment_id, user_id, amount, credits, status')
    .eq('payment_id', paymentId)
    .maybeSingle()
  if (!data) return null
  return {
    paymentId: data.payment_id as string,
    userId: data.user_id as string,
    amount: data.amount as number,
    credits: data.credits as number,
    status: data.status as string,
  }
}

export interface AdminPaymentRow {
  paymentId: string
  userId: string
  userName: string | null
  productCode: string
  orderName: string
  amount: number
  credits: number
  status: string
  paidAt: string | null
  cancelledAt: string | null
  refundedCredits: number
  createdAt: string
  refundRequestedAt: string | null   // 사용자 환불 신청 시각
  refundRequestReason: string | null // 환불 신청 사유
  // 매칭 키 (raw 스냅샷에서 추출 — CS·대사용)
  transactionId: string | null   // PortOne 거래번호
  pgTxId: string | null          // PG(이니시스) TID
  approvalNumber: string | null  // 카드 승인번호
  receiptUrl: string | null      // 영수증 링크
}

// 사용자 본인 결제내역 (어카운트 페이지용)
export interface MyPaymentRow {
  paymentId: string
  orderName: string
  amount: number
  credits: number
  status: string
  refundedCredits: number
  refundRequestedAt: string | null
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
  receiptUrl: string | null
}

export async function listMyPayments(userId: string): Promise<MyPaymentRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payments')
    .select('payment_id, order_name, amount, credits, status, refunded_credits, refund_requested_at, paid_at, cancelled_at, created_at, raw')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) { console.error('[payment.listMine]', error.message); return [] }
  return (data ?? []).map((r) => ({
    paymentId: r.payment_id as string,
    orderName: r.order_name as string,
    amount: r.amount as number,
    credits: r.credits as number,
    status: r.status as string,
    refundedCredits: (r.refunded_credits as number) ?? 0,
    refundRequestedAt: r.refund_requested_at as string | null,
    paidAt: r.paid_at as string | null,
    cancelledAt: r.cancelled_at as string | null,
    createdAt: r.created_at as string,
    receiptUrl: extractMatchKeys(r.raw).receiptUrl,
  }))
}

// 환불 신청 — 본인 paid 건 + 미신청만. 어드민이 검토 후 실제 취소 처리.
export async function requestRefund(
  userId: string,
  paymentId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payments')
    .update({ refund_requested_at: new Date().toISOString(), refund_request_reason: reason })
    .eq('payment_id', paymentId)
    .eq('user_id', userId)
    .eq('status', 'paid')
    .is('refund_requested_at', null)
    .select('payment_id')
    .maybeSingle()
  if (error) { console.error('[payment.requestRefund]', error.message); return { ok: false, error: 'internal' } }
  if (!data) return { ok: false, error: 'not_eligible' }
  return { ok: true }
}

// PortOne raw 스냅샷에서 매칭 키 방어적 추출
function extractMatchKeys(raw: unknown): Pick<AdminPaymentRow, 'transactionId' | 'pgTxId' | 'approvalNumber' | 'receiptUrl'> {
  const r = (raw ?? {}) as Record<string, unknown>
  const method = (r.method ?? {}) as Record<string, unknown>
  const card = (method.card ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  return {
    transactionId: str(r.transactionId),
    pgTxId: str(r.pgTxId),
    approvalNumber: str(method.approvalNumber) ?? str(card.approvalNumber),
    receiptUrl: str(r.receiptUrl),
  }
}

// 어드민 결제/취소/지급 내역 목록 (유저명 조인 + 매칭 키 추출).
export async function listAllPayments(limit = 200): Promise<AdminPaymentRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payments')
    .select('payment_id, user_id, product_code, order_name, amount, credits, status, paid_at, cancelled_at, refunded_credits, refund_requested_at, refund_request_reason, created_at, raw, profiles(display_name, username)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('[payment.listAll]', error.message); return [] }
  return (data ?? []).map((r) => {
    const prof = (r as { profiles?: { display_name?: string | null; username?: string | null } }).profiles
    return {
      paymentId: r.payment_id as string,
      userId: r.user_id as string,
      userName: prof?.display_name ?? prof?.username ?? null,
      productCode: r.product_code as string,
      orderName: r.order_name as string,
      amount: r.amount as number,
      credits: r.credits as number,
      status: r.status as string,
      paidAt: r.paid_at as string | null,
      cancelledAt: r.cancelled_at as string | null,
      refundedCredits: (r.refunded_credits as number) ?? 0,
      refundRequestedAt: r.refund_requested_at as string | null,
      refundRequestReason: r.refund_request_reason as string | null,
      createdAt: r.created_at as string,
      ...extractMatchKeys(r.raw),
    }
  })
}

// 결제 완료 처리 + 크레딧 지급 (멱등).
// ready→paid 조건부 전이가 성공한 호출만 크레딧을 지급 → 서버검증·웹훅 중복 방지.
export async function markPaymentPaidAndGrant(opts: {
  paymentId: string
  pgTxId?: string | null
  raw?: unknown
}): Promise<{ granted: boolean; credits: number; userId: string | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      pg_tx_id: opts.pgTxId ?? null,
      raw: (opts.raw as object) ?? null,
    })
    .eq('payment_id', opts.paymentId)
    .neq('status', 'paid')               // 이미 paid면 행 0개 → 중복 지급 차단
    .select('user_id, credits, amount')
    .maybeSingle()

  if (error) { console.error('[payment.markPaid]', error.message); return { granted: false, credits: 0, userId: null } }
  if (!data) return { granted: false, credits: 0, userId: null } // 이미 처리됨 or 없음

  const userId = data.user_id as string
  const credits = data.credits as number
  const amount = data.amount as number
  // 유상 크레딧 원자적 증가 (mig 039 RPC)
  const { error: rpcErr } = await admin.rpc('add_paid_credits', { p_user: userId, p_delta: credits })
  if (rpcErr) {
    // 지급 실패 시 status 되돌려 재시도 가능하게 (웹훅 재전송이 다시 시도)
    console.error('[payment.grant] add_paid_credits 실패, 롤백:', rpcErr.message)
    await admin.from('payments').update({ status: 'ready', paid_at: null }).eq('payment_id', opts.paymentId)
    return { granted: false, credits: 0, userId }
  }

  // 충전 완료 알림 (지급이 실제 일어난 1회에만 — 멱등 전이 안에서라 중복 없음)
  const { error: notifErr } = await admin
    .from('notifications')
    .insert({ user_id: userId, type: 'credit_charged', payload: { credits, amount } })
  if (notifErr) console.error('[payment.grant] 알림 INSERT 실패:', notifErr.message)

  return { granted: true, credits, userId }
}

// 결제 취소/환불 — 지급됐던 유상 크레딧 회수(멱등). 관리자 취소(웹훅)·환불 API에서 호출.
// 이미 사용한 크레딧이 있어 잔액이 부족하면 add_paid_credits의 GREATEST(0,…)로 0까지만 차감.
export async function markPaymentCancelledAndRevoke(opts: {
  paymentId: string
  revokeCredits?: number   // 회수할 크레딧 (미지정 시 결제 전체 — 웹훅 전액취소 안전망용)
  refundedCredits?: number // refunded_credits 기록값 (미지정 시 회수량과 동일)
  raw?: unknown
}): Promise<{ revoked: boolean; credits: number; userId: string | null }> {
  const admin = createAdminClient()
  // paid였던 건만 회수 경로 (조건부 전이로 멱등 — 이미 cancelled면 행 0개)
  const { data, error } = await admin
    .from('payments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), raw: (opts.raw as object) ?? null })
    .eq('payment_id', opts.paymentId)
    .eq('status', 'paid')
    .select('user_id, credits')
    .maybeSingle()
  if (error) { console.error('[payment.cancelRevoke]', error.message); return { revoked: false, credits: 0, userId: null } }

  if (data) {
    const userId = data.user_id as string
    const credits = data.credits as number
    const revoke = opts.revokeCredits ?? credits
    const refunded = opts.refundedCredits ?? revoke
    if (revoke > 0) await admin.rpc('add_paid_credits', { p_user: userId, p_delta: -revoke })
    await admin.from('payments').update({ refunded_credits: refunded }).eq('payment_id', opts.paymentId)
    return { revoked: true, credits: revoke, userId }
  }

  // paid가 아니었으면(미지급) 단순 취소 표시 — ready/failed만 갱신(이미 cancelled/refunded는 무변경)
  await admin
    .from('payments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('payment_id', opts.paymentId)
    .in('status', ['ready', 'failed'])
  return { revoked: false, credits: 0, userId: null }
}

// PG(PortOne)에 현재 상태를 재조회해 우리 DB와 동기화. 웹훅 누락·콘솔 취소 보정용.
//   PG 취소(전체/부분) & 우리 paid → 취소금액 비례로 회수·취소 처리(멱등)
//   PG 결제완료 & 우리 ready    → 지급(멱등)
export async function reconcilePaymentFromPg(
  paymentId: string,
): Promise<{ changed: boolean; status: string; detail?: string }> {
  const rec = await getPaymentRecord(paymentId)
  if (!rec) return { changed: false, status: 'not_found' }
  const pay = await getPortonePayment(paymentId)
  if (!pay) return { changed: false, status: 'pg_unreachable' }
  const pg = pay.status

  if ((pg === 'CANCELLED' || pg === 'PARTIAL_CANCELLED') && rec.status === 'paid') {
    const total = pay.amount?.total ?? rec.amount
    const cancelledAmt = pay.amount?.cancelled ?? (pg === 'CANCELLED' ? total : 0)
    const revoke = total > 0 ? Math.min(rec.credits, Math.round(rec.credits * cancelledAmt / total)) : rec.credits
    await markPaymentCancelledAndRevoke({ paymentId, revokeCredits: revoke, refundedCredits: revoke, raw: pay })
    return { changed: true, status: 'cancelled', detail: `${revoke}cr 회수` }
  }
  if (pg === 'PAID' && rec.status === 'ready' && pay.amount?.total === rec.amount) {
    await markPaymentPaidAndGrant({ paymentId, pgTxId: typeof pay.transactionId === 'string' ? pay.transactionId : null, raw: pay })
    return { changed: true, status: 'paid', detail: '지급 완료' }
  }
  return { changed: false, status: rec.status }
}

// 결제 실패/취소 기록 (지급 없음).
export async function markPaymentStatus(
  paymentId: string,
  status: 'failed' | 'cancelled',
  raw?: unknown,
): Promise<void> {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = { status, raw: (raw as object) ?? null }
  if (status === 'cancelled') patch.cancelled_at = new Date().toISOString()
  await admin.from('payments').update(patch).eq('payment_id', paymentId).neq('status', 'paid')
}
