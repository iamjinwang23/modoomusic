// GET /api/admin/iap — 앱 인앱결제(App Store/Play Store) 지급 내역 (어드민, 조회 전용)
import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { listAllIapPurchases } from '@/services/payment.service'

export async function GET() {
  const auth = await requireAdminApi('payments')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const data = await listAllIapPurchases()
  return NextResponse.json({ data })
}
