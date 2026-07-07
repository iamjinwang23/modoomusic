// GET /api/payments/me — 본인 결제내역 (어카운트 페이지)
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { listMyPayments } from '@/services/payment.service'

export async function GET() {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const data = await listMyPayments(user.id)
  return NextResponse.json({ data })
}
