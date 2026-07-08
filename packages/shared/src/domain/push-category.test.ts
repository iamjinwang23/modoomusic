import { describe, expect, it } from 'vitest'
import {
  PUSH_CATEGORIES,
  PUSH_CATEGORY_LABELS,
  notificationTypeToCategory,
} from './index'

describe('push category', () => {
  it('카테고리 6종', () => {
    expect(PUSH_CATEGORIES).toEqual([
      'song_complete', 'likes', 'comments', 'follow', 'community', 'credit',
    ])
  })

  it('모든 카테고리에 라벨', () => {
    for (const c of PUSH_CATEGORIES) {
      expect(PUSH_CATEGORY_LABELS[c]).toBeTruthy()
    }
  })

  it('알림 타입 → 카테고리 매핑', () => {
    expect(notificationTypeToCategory('song_complete')).toBe('song_complete')
    expect(notificationTypeToCategory('like')).toBe('likes')
    expect(notificationTypeToCategory('comment')).toBe('comments')
    expect(notificationTypeToCategory('follow')).toBe('follow')
    expect(notificationTypeToCategory('community_like')).toBe('community')
    expect(notificationTypeToCategory('community_closing')).toBe('community')
    expect(notificationTypeToCategory('credit_charged')).toBe('credit')
  })

  it('system 은 토글 대상 아님', () => {
    expect(notificationTypeToCategory('system')).toBeNull()
  })
})
