export type Platform = 'web' | 'ios' | 'android'
export interface CreditPack { id: string; credits: number; webPriceKrw: number }

// webPriceKrw = 웹(PortOne) 가격. 스토어별 마크업(native-ios-app.design §14.2):
//   iOS(Apple 30%) +30% · Android(Play ~15%) +15%. 크레딧 잔액은 웹/앱 공유.
export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_100', credits: 100, webPriceKrw: 4900 },
  { id: 'pack_300', credits: 300, webPriceKrw: 12900 },
  { id: 'pack_1000', credits: 1000, webPriceKrw: 39000 },
]

const MARKUP: Record<Platform, number> = { web: 1.0, ios: 1.3, android: 1.15 }
export function packPrice(packId: string, platform: Platform): number {
  const pack = CREDIT_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error(`unknown pack: ${packId}`)
  return Math.round(pack.webPriceKrw * MARKUP[platform])
}
