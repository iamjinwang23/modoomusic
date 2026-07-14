import { Platform } from 'react-native'
import { IAP_PRODUCTS } from '@mono/shared'
import { api } from './api'

// 직접 인앱결제(react-native-iap v15, StoreKit2/Play Billing). 지급은 서버 검증(/api/iap/verify).
// ⚠️ 네이티브 모듈(Nitro)이라 미포함 빌드에서 import만 해도 크래시 → 지연 require + try/catch로 가드.
//    네이티브 없으면 iapAvailable()=false → 충전 화면은 "준비 중"으로 안전하게 표시.
// 라이브러리 타입을 직접 import하면 tsc가 그 소스까지 컴파일하므로(내부 global 에러) 로컬 최소 타입만 사용.
export type Product = { id?: string; productId?: string; title?: string; displayPrice?: string; localizedPrice?: string; price?: string }
export type Purchase = { productId?: string; purchaseToken?: string; jwsRepresentation?: string }
export type PurchaseError = { userCancelled?: boolean; code?: string; message?: string }
type Sub = { remove: () => void }
interface IapMod {
  initConnection: () => Promise<unknown>
  endConnection: () => Promise<unknown>
  fetchProducts: (o: unknown) => Promise<unknown>
  requestPurchase: (o: unknown) => Promise<unknown>
  finishTransaction: (o: unknown) => Promise<unknown>
  purchaseUpdatedListener: (cb: (p: Purchase) => void) => Sub
  purchaseErrorListener: (cb: (e: PurchaseError) => void) => Sub
}

// 결제 게이트 — 네이티브 모듈(react-native-iap + nitro)이 포함되고 결제가 열린 빌드에서만 'true'.
// 미설정 빌드에선 아예 require를 하지 않아 NitroModules 크래시를 원천 차단.
const IAP_ENABLED = process.env.EXPO_PUBLIC_IAP_ENABLED === 'true'

let mod: IapMod | null = null
let failed = false
function iap(): IapMod | null {
  if (!IAP_ENABLED) return null
  if (mod || failed) return mod
  try { mod = require('react-native-iap') as IapMod } catch { failed = true; mod = null }
  return mod
}

export const SKUS = IAP_PRODUCTS.map((p) => p.productId)
export function iapAvailable(): boolean { return IAP_ENABLED && !!iap() }

export async function iapInit(): Promise<boolean> {
  const m = iap(); if (!m) return false
  try { await m.initConnection(); return true } catch { return false }
}
export async function iapEnd(): Promise<void> {
  const m = iap(); if (!m) return
  try { await m.endConnection() } catch { /* 무시 */ }
}
export async function iapProducts(): Promise<Product[]> {
  const m = iap(); if (!m) return []
  try {
    const r = await (m.fetchProducts as (o: unknown) => Promise<unknown>)({ skus: SKUS, type: 'in-app' })
    return (Array.isArray(r) ? r : []) as Product[]
  } catch { return [] }
}
export function onPurchaseUpdated(cb: (p: Purchase) => void): Sub {
  const m = iap(); return m ? m.purchaseUpdatedListener(cb) : { remove() {} }
}
export function onPurchaseError(cb: (e: PurchaseError) => void): Sub {
  const m = iap(); return m ? m.purchaseErrorListener(cb) : { remove() {} }
}
export async function iapBuy(sku: string): Promise<void> {
  const m = iap(); if (!m) return
  await (m.requestPurchase as (o: unknown) => Promise<unknown>)({
    request: { ios: { sku }, android: { skus: [sku] } },
    type: 'in-app',
  })
}
export async function iapFinish(purchase: Purchase): Promise<void> {
  const m = iap(); if (!m) return
  try { await (m.finishTransaction as (o: unknown) => Promise<unknown>)({ purchase, isConsumable: true }) } catch { /* 무시 */ }
}

// 서버 검증 + 크레딧 지급. iOS=StoreKit2 JWS, Android=Play purchaseToken(v15 통합 필드).
export async function verifyPurchase(purchase: Purchase): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = purchase as { productId?: string; purchaseToken?: string; jwsRepresentation?: string; jwsRepresentationIos?: string; transactionReceipt?: string }
    const platform = Platform.OS === 'ios' ? 'ios' : 'android'
    // iOS = StoreKit2 signedTransaction(JWS), Android = Play purchaseToken. 필드명 편차 대비 폴백.
    const token = platform === 'ios'
      ? (p.jwsRepresentation ?? p.jwsRepresentationIos ?? p.purchaseToken ?? p.transactionReceipt ?? '')
      : (p.purchaseToken ?? '')
    await api.post('/api/iap/verify', { platform, productId: p.productId, token })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as { error?: string })?.error ?? 'verify_failed' }
  }
}
