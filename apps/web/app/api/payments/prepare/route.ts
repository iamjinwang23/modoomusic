// POST /api/payments/prepare — 크레딧 구매 사전 등록.
// payments에 ready 행 생성(서버가 금액·크레딧 스냅샷) 후 결제창 파라미터 반환.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getCreditProduct, createPaymentRecord } from '@/services/payment.service'

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { productCode?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }

  const product = getCreditProduct(body.productCode)
  if (!product) return NextResponse.json({ error: 'invalid_product' }, { status: 400 })

  const rec = await createPaymentRecord(user.id, product)
  if (!rec) return NextResponse.json({ error: 'internal' }, { status: 500 })

  return NextResponse.json({
    paymentId: rec.paymentId,
    orderName: product.orderName,
    amount: product.amount,
    currency: 'CURRENCY_KRW',
    storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? '',
    channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY ?? '',
  })
}
