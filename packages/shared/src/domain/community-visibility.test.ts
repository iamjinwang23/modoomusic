import { describe, expect, it } from 'vitest'
import {
  LEAVE_COOLDOWN_MS,
  REJOIN_COOLDOWN_MS,
  canLeaveCommunity,
  rejoinAvailableAtIso,
  isRejoinCooldownActive,
  notificationTypeToCategory,
} from './index'

describe('커뮤니티 탈퇴 24h 쿨다운', () => {
  const joined = '2026-07-08T00:00:00.000Z'
  it('상수 = 24시간', () => {
    expect(LEAVE_COOLDOWN_MS).toBe(86_400_000)
  })
  it('24h 이내면 탈퇴 불가', () => {
    const now = new Date('2026-07-08T23:59:59.000Z').getTime()
    expect(canLeaveCommunity(joined, now)).toBe(false)
  })
  it('정확히 24h 경과 시 탈퇴 가능', () => {
    const now = new Date('2026-07-09T00:00:00.000Z').getTime()
    expect(canLeaveCommunity(joined, now)).toBe(true)
  })
})

describe('거절 재신청 2일 쿨다운', () => {
  const decided = '2026-07-08T00:00:00.000Z'
  it('상수 = 2일', () => {
    expect(REJOIN_COOLDOWN_MS).toBe(172_800_000)
  })
  it('해제 시각 = 거절 + 2일', () => {
    expect(rejoinAvailableAtIso(decided)).toBe('2026-07-10T00:00:00.000Z')
  })
  it('2일 이내면 쿨다운 활성', () => {
    const now = new Date('2026-07-09T12:00:00.000Z').getTime()
    expect(isRejoinCooldownActive(decided, now)).toBe(true)
  })
  it('2일 경과 시 쿨다운 해제', () => {
    const now = new Date('2026-07-10T00:00:00.000Z').getTime()
    expect(isRejoinCooldownActive(decided, now)).toBe(false)
  })
})

describe('가입 알림 타입 → community 카테고리', () => {
  it('신청·승인·거절 모두 community', () => {
    expect(notificationTypeToCategory('community_join_request')).toBe('community')
    expect(notificationTypeToCategory('community_join_approved')).toBe('community')
    expect(notificationTypeToCategory('community_join_rejected')).toBe('community')
  })
})
