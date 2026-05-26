// Explore feed + 다른 사용자 프로필을 Supabase에서 조회
// 모든 메서드는 async — 호출부는 useEffect로 fetch 후 setState 사용
import type { PublicSong, UserProfile, SocialLinks } from '@/types/domain'
import { createClient } from '@/lib/supabase/client'

export type FeedTab = 'recommended' | 'latest' | 'popular'

interface SongRow {
  id: string
  title: string | null
  prompt: string
  genre: string | null
  mood: string | null
  instrumental: boolean | null
  audio_url: string | null
  cover_hue: number | null
  cover_image: string | null
  duration: number | null
  lyrics: string | null
  created_at: string
  like_count: number | null
  play_count: number | null
  user_id: string
  profiles: { username: string; display_name: string | null } | null
}

function rowToPublicSong(r: SongRow): PublicSong {
  return {
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    genre: r.genre,
    mood: r.mood,
    instrumental: !!r.instrumental,
    audioUrl: r.audio_url ?? '',
    coverHue: r.cover_hue ?? 0,
    coverImage: r.cover_image ?? undefined,
    duration: r.duration,
    lyrics: r.lyrics,
    createdAt: r.created_at,
    username: r.profiles?.username ?? 'unknown',
    displayName: r.profiles?.display_name ?? r.profiles?.username ?? '익명',
    userId: r.user_id,
    likeCount: r.like_count ?? 0,
    playCount: r.play_count ?? 0,
    isLiked: false,  // 좋아요 상태는 별도 조회 (현재 미구현)
  }
}

function feedOrderColumn(tab: FeedTab): string {
  // recommended는 fetch 후 클라이언트에서 score로 재정렬 (아래 sortRecommended 참고)
  // 일단 published_at desc로 받아두면 동점 시 자연스럽게 최신순이 됨
  switch (tab) {
    case 'latest':       return 'published_at'
    case 'popular':      return 'play_count'
    case 'recommended':
    default:             return 'published_at'
  }
}

// 에디터 추천: 점수 = 좋아요 × 3 + 재생수. 동점은 최신순(이미 fetch가 published_at desc)
function sortRecommended(songs: PublicSong[]): PublicSong[] {
  return [...songs].sort((a, b) => {
    const sa = (a.likeCount ?? 0) * 3 + (a.playCount ?? 0)
    const sb = (b.likeCount ?? 0) * 3 + (b.playCount ?? 0)
    if (sb !== sa) return sb - sa
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

const SONG_SELECT = `
  id, title, prompt, genre, mood, instrumental, audio_url, cover_hue, cover_image,
  duration, lyrics, created_at, like_count, play_count, user_id,
  profiles!songs_user_id_fkey ( username, display_name )
`

export const exploreService = {
  async getFeed(tab: FeedTab, limit = 60): Promise<PublicSong[]> {
    const supabase = createClient()
    // recommended는 점수 정렬을 위해 넉넉히 fetch한 뒤 클라이언트에서 재정렬
    const fetchLimit = tab === 'recommended' ? Math.max(limit, 60) : limit
    const { data, error } = await supabase
      .from('songs')
      .select(SONG_SELECT)
      .eq('is_public', true)
      .order(feedOrderColumn(tab), { ascending: false, nullsFirst: false })
      .limit(fetchLimit)
    if (error) { console.error('[exploreService.getFeed]', error.message); return [] }
    const mapped = (data as unknown as SongRow[]).map(rowToPublicSong)
    return tab === 'recommended' ? sortRecommended(mapped).slice(0, limit) : mapped
  },

  async getByFilter(tab: FeedTab, genres: string[], moods: string[], limit = 60): Promise<PublicSong[]> {
    const supabase = createClient()
    const fetchLimit = tab === 'recommended' ? Math.max(limit, 60) : limit
    let q = supabase
      .from('songs')
      .select(SONG_SELECT)
      .eq('is_public', true)
      .order(feedOrderColumn(tab), { ascending: false, nullsFirst: false })
      .limit(fetchLimit)
    if (genres.length > 0) q = q.in('genre', genres)
    if (moods.length > 0)  q = q.in('mood',  moods)
    const { data, error } = await q
    if (error) { console.error('[exploreService.getByFilter]', error.message); return [] }
    const mapped = (data as unknown as SongRow[]).map(rowToPublicSong)
    return tab === 'recommended' ? sortRecommended(mapped).slice(0, limit) : mapped
  },

  async getProfile(username: string): Promise<UserProfile | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, username, display_name, bio, avatar_hue, avatar_url, cover_url,
        follower_count, following_count, song_count,
        link_instagram, link_tiktok, link_youtube, link_facebook, link_x
      `)
      .eq('username', username)
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[exploreService.getProfile]', error.message)
      return null
    }
    const links: SocialLinks = {
      instagram: data.link_instagram,
      tiktok:    data.link_tiktok,
      youtube:   data.link_youtube,
      facebook:  data.link_facebook,
      x:         data.link_x,
    }
    return {
      username: data.username,
      displayName: data.display_name ?? data.username,
      userId: data.id,
      bio: data.bio,
      avatarHue: data.avatar_hue ?? 0,
      avatarImage: data.avatar_url ?? undefined,
      coverImage: data.cover_url ?? undefined,
      followerCount: data.follower_count ?? 0,
      followingCount: data.following_count ?? 0,
      songCount: data.song_count ?? 0,
      links,
    }
  },

  async getUserSongs(username: string, limit = 60): Promise<PublicSong[]> {
    const supabase = createClient()
    // 1) username으로 user_id 찾기
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (!prof) return []
    const { data, error } = await supabase
      .from('songs')
      .select(SONG_SELECT)
      .eq('user_id', prof.id)
      .eq('is_public', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (error) { console.error('[exploreService.getUserSongs]', error.message); return [] }
    return (data as unknown as SongRow[]).map(rowToPublicSong)
  },

  async getPublicSongById(id: string): Promise<PublicSong | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('songs')
      .select(SONG_SELECT)
      .eq('id', id)
      .eq('is_public', true)
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[exploreService.getPublicSongById]', error.message)
      return null
    }
    return rowToPublicSong(data as unknown as SongRow)
  },

  async getPopularProfiles(limit = 12): Promise<UserProfile[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_hue, avatar_url, follower_count, song_count')
      .gt('song_count', 0)
      .order('follower_count', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (error) { console.error('[exploreService.getPopularProfiles]', error.message); return [] }
    return data.map((d) => ({
      username: d.username,
      displayName: d.display_name ?? d.username,
      userId: d.id,
      bio: null,
      avatarHue: d.avatar_hue ?? 0,
      avatarImage: d.avatar_url ?? undefined,
      followerCount: d.follower_count ?? 0,
      followingCount: 0,
      songCount: d.song_count ?? 0,
    }))
  },
}
