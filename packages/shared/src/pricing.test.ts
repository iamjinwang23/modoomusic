import { describe, it, expect } from 'vitest'
import { CREDIT_PACKS, packPrice } from './pricing'

describe('pricing', () => {
  it('iOS 가격은 웹 대비 +30% (반올림)', () => {
    const pack = CREDIT_PACKS[0]
    expect(packPrice(pack.id, 'ios')).toBe(Math.round(pack.webPriceKrw * 1.3))
  })
  it('Android 가격은 웹 대비 +15% (Play 수수료 반영)', () => {
    const pack = CREDIT_PACKS[0]
    expect(packPrice(pack.id, 'android')).toBe(Math.round(pack.webPriceKrw * 1.15))
  })
  it('web 가격은 원가 그대로', () => {
    const pack = CREDIT_PACKS[0]
    expect(packPrice(pack.id, 'web')).toBe(pack.webPriceKrw)
  })
  it('알 수 없는 팩은 에러', () => {
    expect(() => packPrice('nope', 'web')).toThrow()
  })
})
