import type { PublicSong, UserProfile } from '@/types/domain'
import { MOCK_SONGS, MOCK_PROFILES } from '@/features/explore/mock/explore.mock'

export type FeedTab = 'recommended' | 'latest' | 'popular'

export const exploreService = {
  getFeed(tab: FeedTab): PublicSong[] {
    switch (tab) {
      case 'latest':
        return [...MOCK_SONGS].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      case 'popular':
        return [...MOCK_SONGS].sort((a, b) => b.playCount - a.playCount)
      case 'recommended':
      default:
        return [...MOCK_SONGS].sort((a, b) => b.likeCount - a.likeCount)
    }
  },

  getByFilter(tab: FeedTab, genres: string[], moods: string[]): PublicSong[] {
    let songs = this.getFeed(tab)
    if (genres.length > 0) {
      songs = songs.filter((s) => s.genre && genres.includes(s.genre))
    }
    if (moods.length > 0) {
      songs = songs.filter((s) => s.mood && moods.includes(s.mood))
    }
    return songs
  },

  getProfile(username: string): UserProfile | null {
    return MOCK_PROFILES.find((p) => p.username === username) ?? null
  },

  getUserSongs(username: string): PublicSong[] {
    return MOCK_SONGS.filter((s) => s.username === username).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  getPopularProfiles(): UserProfile[] {
    const profileMap = new Map<string, UserProfile>()
    MOCK_PROFILES.forEach((p) => profileMap.set(p.userId, p))
    const counts = new Map<string, number>()
    MOCK_SONGS.forEach((s) => counts.set(s.userId, (counts.get(s.userId) ?? 0) + s.likeCount))
    return [...profileMap.values()].sort(
      (a, b) => (counts.get(b.userId) ?? 0) - (counts.get(a.userId) ?? 0)
    )
  },
}
