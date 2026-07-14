// 앱 인앱결제(RevenueCat) 크레딧 상품 카탈로그 — 서버·클라 공용.
// 상품ID → 지급 크레딧이 서버 지급의 진실원천. 가격은 스토어(App Store/Play)가 정의하고
// 클라는 RevenueCat offerings에서 로컬라이즈된 가격을 표시한다. 웹(PortOne)은 별도(credit-products.ts).
// 웹 크레딧 상품과 동일한 지급량(60·130·250·560)으로 맞춘다.

export interface IapProduct {
  productId: string // App Store Connect / Play Console 상품 ID (동일 문자열로 등록)
  credits: number   // 지급 크레딧
  label: string     // 표시명(폴백)
}

export const IAP_PRODUCTS: IapProduct[] = [
  { productId: 'mono_credit_60', credits: 60, label: 'MONO 크레딧 60' },
  { productId: 'mono_credit_130', credits: 130, label: 'MONO 크레딧 130' },
  { productId: 'mono_credit_250', credits: 250, label: 'MONO 크레딧 250' },
  { productId: 'mono_credit_560', credits: 560, label: 'MONO 크레딧 560' },
]

// 스토어/스토어별 접미사(mono_credit_60:ios 등)를 감안해 앞부분 매칭도 허용.
export function iapCredits(productId: string): number | null {
  const p = IAP_PRODUCTS.find((x) => x.productId === productId || productId.startsWith(`${x.productId}`))
  return p ? p.credits : null
}
