// POST /api/iap/verify — 앱 인앱결제 영수증 서버 검증 + 크레딧 지급(멱등).
// 클라(react-native-iap)가 구매 직후 { platform, productId, token }을 보냄.
//   iOS   token = StoreKit2 signedTransaction(JWS) → Apple 루트 인증서로 서명 검증 후 트랜잭션 추출.
//   Android token = Play purchaseToken → Play Developer API 검증(서비스 계정, 추후).
// ⚠️ 보안: 반드시 스토어 검증 성공 시에만 지급. 검증 실패/미설정이면 지급 금지.

import { NextRequest, NextResponse } from 'next/server'
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { iapCredits } from '@mono/shared'

interface VerifiedTx { transactionId: string; productId: string; store: string }

const BUNDLE_ID = 'com.modoomusic.app'
// App Store 앱 ID(공개 식별자). @apple/app-store-server-library는 PRODUCTION 환경 검증 시
// appAppleId가 없으면 생성자에서 예외를 던짐 → 실결제(production) 영수증 검증이 통째로 실패한다.
// (SANDBOX/TestFlight는 appAppleId 불필요라 그동안 문제가 드러나지 않았음.)
const APP_APPLE_ID = 6790648491
// Apple 루트 CA(공개, DER base64) — Vercel 파일추적 회피 위해 인라인. G3(StoreKit2 ECC 체인)·G2.
const APPLE_ROOT_CAS = [
  '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',
].map((b64) => Buffer.from(b64, 'base64'))

// iOS: StoreKit2 signedTransaction(JWS) 서명 검증 → 트랜잭션 추출. sandbox/production 둘 다 시도.
async function verifyApple(signedTransaction: string): Promise<VerifiedTx | null> {
  for (const env of [Environment.SANDBOX, Environment.PRODUCTION]) {
    try {
      // PRODUCTION은 appAppleId 필수(없으면 생성자 throw), SANDBOX는 넘기면 안 됨(undefined).
      const appAppleId = env === Environment.PRODUCTION ? APP_APPLE_ID : undefined
      const verifier = new SignedDataVerifier(APPLE_ROOT_CAS, false, env, BUNDLE_ID, appAppleId)
      const tx = await verifier.verifyAndDecodeTransaction(signedTransaction)
      if (tx?.productId && tx?.transactionId != null) {
        return { transactionId: String(tx.transactionId), productId: String(tx.productId), store: 'app_store' }
      }
    } catch { /* 다음 환경 시도 */ }
  }
  return null
}

// Android: Play Developer API purchases.products.get 검증 (서비스 계정 필요 — 추후).
async function verifyGoogle(_token: string, _productId: string): Promise<VerifiedTx | null> {
  if (!process.env.GOOGLE_PLAY_SA_JSON) return null
  // TODO: 서비스 계정 OAuth → androidpublisher purchases.products.get → purchaseState 확인.
  return null
}

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { platform?: unknown; productId?: unknown; token?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null
  const token = typeof body.token === 'string' ? body.token : ''
  if (!platform || !token) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  const tx = platform === 'ios'
    ? await verifyApple(token)
    : await verifyGoogle(token, typeof body.productId === 'string' ? body.productId : '')
  if (!tx) return NextResponse.json({ error: platform === 'android' ? 'not_configured' : 'verify_failed' }, { status: platform === 'android' ? 501 : 400 })

  const credits = iapCredits(tx.productId)
  if (!credits) return NextResponse.json({ error: 'unknown_product' }, { status: 400 })

  const admin = createAdminClient()
  const { error: insErr } = await admin.from('iap_purchases').insert({
    user_id: user.id, store: tx.store, product_id: tx.productId, credits,
    transaction_id: tx.transactionId, raw: { platform },
  })
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') return NextResponse.json({ ok: true, duplicate: true })
    console.error('[iap/verify] insert', insErr.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  const { error: rpcErr } = await admin.rpc('add_paid_credits', { p_user: user.id, p_delta: credits })
  if (rpcErr) { console.error('[iap/verify] grant', rpcErr.message); return NextResponse.json({ error: 'grant_failed' }, { status: 500 }) }
  return NextResponse.json({ ok: true, granted: credits })
}
