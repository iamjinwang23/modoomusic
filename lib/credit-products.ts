// 크레딧 상품 카탈로그 — 서버·클라 공용(순수 데이터, 서버 의존 X).
// 서버는 금액 검증의 진실원천으로, 클라는 구매 모달 표시에 사용.
// 가격/크레딧 변경은 코드 배포(약관 제12조 사전고지). 확정 2026-06-24.
export interface CreditProduct {
  code: string
  amount: number    // 결제 금액(원, VAT 포함)
  credits: number   // 지급 크레딧
  orderName: string // PortOne 결제창·내역 표기
}

export const CREDIT_PRODUCTS: Record<string, CreditProduct> = {
  credit_2900:  { code: 'credit_2900',  amount: 2900,  credits: 60,  orderName: 'MONO 크레딧 60' },
  credit_5900:  { code: 'credit_5900',  amount: 5900,  credits: 130, orderName: 'MONO 크레딧 130' },
  credit_9900:  { code: 'credit_9900',  amount: 9900,  credits: 250, orderName: 'MONO 크레딧 250' },
  credit_19900: { code: 'credit_19900', amount: 19900, credits: 560, orderName: 'MONO 크레딧 560' },
}

// 표시 순서(저가→고가)
export const CREDIT_PRODUCT_LIST: CreditProduct[] = [
  CREDIT_PRODUCTS.credit_2900,
  CREDIT_PRODUCTS.credit_5900,
  CREDIT_PRODUCTS.credit_9900,
  CREDIT_PRODUCTS.credit_19900,
]

export function getCreditProduct(code: unknown): CreditProduct | null {
  if (typeof code !== 'string') return null
  return CREDIT_PRODUCTS[code] ?? null
}
