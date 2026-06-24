// PortOne V2 서버 REST 헬퍼 — 결제 단건 조회(서버 검증용).
// API Secret은 서버 전용 env. 절대 클라이언트 노출 금지.
const PORTONE_API = 'https://api.portone.io'

export interface PortonePayment {
  status: string // 'PAID' | 'READY' | 'FAILED' | 'CANCELLED' | 'PARTIAL_CANCELLED' | 'VIRTUAL_ACCOUNT_ISSUED' 등
  amount?: { total?: number; cancelled?: number }
  id?: string
  transactionId?: string
  [k: string]: unknown
}

// GET /payments/{paymentId} — 상태·금액 서버 검증. 실패 시 null.
export async function getPortonePayment(paymentId: string): Promise<PortonePayment | null> {
  const secret = process.env.PORTONE_API_SECRET
  if (!secret) {
    console.error('[portone] PORTONE_API_SECRET 미설정')
    return null
  }
  try {
    const res = await fetch(`${PORTONE_API}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `PortOne ${secret}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[portone] getPayment HTTP', res.status, await res.text().catch(() => ''))
      return null
    }
    return (await res.json()) as PortonePayment
  } catch (e) {
    console.error('[portone] getPayment 예외:', e)
    return null
  }
}

// POST /payments/{paymentId}/cancel — 취소(환불). amount 지정 시 부분취소, 미지정 시 전액. 성공 시 ok:true.
export async function cancelPortonePayment(
  paymentId: string,
  reason: string,
  amount?: number,
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.PORTONE_API_SECRET
  if (!secret) return { ok: false, error: 'not_configured' }
  try {
    const body: Record<string, unknown> = { reason }
    if (typeof amount === 'number' && amount > 0) body.amount = amount
    const res = await fetch(`${PORTONE_API}/payments/${encodeURIComponent(paymentId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `PortOne ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.error('[portone] cancel HTTP', res.status, t)
      return { ok: false, error: t || `${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    console.error('[portone] cancel 예외:', e)
    return { ok: false, error: 'exception' }
  }
}
