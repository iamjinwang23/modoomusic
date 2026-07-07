// GET /api/admin/payments — 결제/취소/지급 내역 (어드민)
import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { listAllPayments } from '@/services/payment.service'

export async function GET() {
  const auth = await requireAdminApi('payments')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const data = await listAllPayments()
  return NextResponse.json({ data })
}
