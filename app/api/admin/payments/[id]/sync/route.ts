// POST /api/admin/payments/[id]/sync — PortOne 상태 재조회·동기화 (웹훅 누락·콘솔 취소 보정).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { reconcilePaymentFromPg } from '@/services/payment.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('payments')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: paymentId } = await params
  const result = await reconcilePaymentFromPg(paymentId)
  return NextResponse.json(result)
}
