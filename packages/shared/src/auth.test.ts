import { describe, it, expect } from 'vitest'
import { resolveAuthToken } from './auth'

describe('resolveAuthToken', () => {
  it('Authorization 헤더의 Bearer 토큰을 반환', () => {
    const h = new Headers({ authorization: 'Bearer abc.def.ghi' })
    expect(resolveAuthToken(h)).toBe('abc.def.ghi')
  })
  it('Bearer 없으면 null (쿠키 경로로 위임)', () => {
    expect(resolveAuthToken(new Headers())).toBeNull()
  })
  it('Bearer 뒤 값이 비면 null', () => {
    expect(resolveAuthToken(new Headers({ authorization: 'Bearer ' }))).toBeNull()
  })
  it('Bearer 아닌 스킴은 null', () => {
    expect(resolveAuthToken(new Headers({ authorization: 'Basic xyz' }))).toBeNull()
  })
})
