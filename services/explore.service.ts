// Explore feed + 다른 사용자 프로필을 Supabase에서 조회
// 모든 메서드는 async — 호출부는 useEffect로 fetch 후 setState 사용
import type { PublicSong, UserProfile, SocialLinks } from '@/types/domain'
import { createClient } from '@/lib/supabase/client'

export type FeedTab = 'recommended' | 'latest' | 'popular'

export interface SongRow {
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
  publish_comment: string | null
  publish_cover_image: string | null
  is_public: boolean | null
  created_at: string
  like_count: number | null
  play_count: number | null
  comment_count: number | null
  user_id: string
  profiles: { username: string; display_name: string | null; avatar_hue: number | null; avatar_url: string | null } | null
}

export function rowToPublicSong(r: SongRow): PublicSong {
  return {
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    genre: r.genre,
    mood: r.mood,
    instrumental: !!r.instrumental,
    audioUrl: r.audio_url ?? '',
    coverHue: r.cover_hue ?? 0,
    coverImage: r.publish_cover_image ?? r.cover_image ?? undefined,  // 게시용 커버 우선
    duration: r.duration,
    lyrics: r.lyrics,
    publishComment: r.publish_comment ?? undefined,
    publishCoverImage: r.publish_cover_image ?? undefined,
    published: !!r.is_public,
    createdAt: r.created_at,
    username: r.profiles?.username ?? 'unknown',
    displayName: r.profiles?.display_name ?? r.profiles?.username ?? '익명',
    userId: r.user_id,
    avatarHue: r.profiles?.avatar_hue ?? 0,
    avatarUrl: r.profiles?.avatar_url ?? null,
    likeCount: r.like_count ?? 0,
    playCount: r.play_count ?? 0,
    commentCount: r.comment_count ?? 0,
    isLiked: false,  // fillIsLiked가 후처리로 덮어씀 (default false)
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

export const SONG_SELECT = `
  id, title, prompt, genre, mood, instrumental, audio_url, cover_hue, cover_image, publish_cover_image,
  duration, lyrics, publish_comment, is_public, created_at, like_count, play_count, comment_count, user_id,
  profiles!songs_user_id_fkey ( username, display_name, avatar_hue, avatar_url )
`

// social-actions §4.3 — 본인 좋아요 상태 후처리 (song_ids in 쿼리 1번으로 N+1 회피)
// supabase.auth.getUser()는 새로고침 직후 hydrate race로 null 가능 → 호출자가 user를 가져옴
async function fillIsLiked(
  supabase: ReturnType<typeof createClient>,
  songs: PublicSong[],
): Promise<PublicSong[]> {
  if (songs.length === 0) return songs
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return songs
  const songIds = songs.map((s) => s.id)
  const { data: myLikes } = await supabase
    .from('likes')
    .select('song_id')
    .eq('user_id', user.id)
    .in('song_id', songIds)
  const likedSet = new Set((myLikes ?? []).map((l) => l.song_id))
  return songs.map((s) => ({ ...s, isLiked: likedSet.has(s.id) }))
}

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
    const mapped = await fillIsLiked(supabase, (data as unknown as SongRow[]).map(rowToPublicSong))
    return tab === 'recommended' ? sortRecommended(mapped).slice(0, limit) : mapped
  },

  async getByFilter(tab: FeedTab, genres: string[], moods: string[], limit = 60): Promise<PublicSong[]> {
    const supabase = createClient()
    const fetchLimit = tab === 'recommended' ? Math.max(limit, 60) : limit
    // 필터가 있으면 DB .in()으로 1차 좁히지 X — inferTags 추출값 매칭이 클라이언트에서 일어나므로
    // 모두 fetch한 뒤 후처리 필터 (곡 500개 이내 가정. 기존 곡 genre/mood NULL인 케이스 흡수)
    const { data, error } = await supabase
      .from('songs')
      .select(SONG_SELECT)
      .eq('is_public', true)
      .order(feedOrderColumn(tab), { ascending: false, nullsFirst: false })
      .limit(fetchLimit)
    if (error) { console.error('[exploreService.getByFilter]', error.message); return [] }
    let mapped = await fillIsLiked(supabase, (data as unknown as SongRow[]).map(rowToPublicSong))
    if (genres.length > 0 || moods.length > 0) {
      const { inferTags } = await import('@/utils/extractTags')
      const songRows = data as unknown as Array<SongRow & { prompt?: string | null; title?: string | null; lyrics?: string | null }>
      mapped = mapped.filter((song, idx) => {
        const r = songRows[idx]
        const inferred = inferTags({ prompt: r.prompt, title: r.title, lyrics: r.lyrics })
        const effectiveGenre = song.genre ?? inferred.genre
        const effectiveMood  = song.mood  ?? inferred.mood
        const genreOk = genres.length === 0 || (effectiveGenre !== null && genres.includes(effectiveGenre))
        const moodOk  = moods.length === 0  || (effectiveMood  !== null && moods.includes(effectiveMood))
        return genreOk && moodOk
      })
    }
    return tab === 'recommended' ? sortRecommended(mapped).slice(0, limit) : mapped
  },

  // social-actions §4.3 — currentUserId 명시 전달. supabase.auth.getUser()는 새로고침 직후
  // hydrate race로 null이 올 수 있어 호출자(useAuth().user)가 알려주는 게 안전
  async getProfile(username: string, currentUserId?: string | null): Promise<UserProfile | null> {
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
    // 본인이 이 사용자를 팔로우 중인지 확인
    let isFollowing = false
    if (currentUserId && currentUserId !== data.id) {
      const { count } = await supabase
        .from('follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', currentUserId)
        .eq('following_id', data.id)
      isFollowing = (count ?? 0) > 0
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
      isFollowing,
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
    return fillIsLiked(supabase, (data as unknown as SongRow[]).map(rowToPublicSong))
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
    const [filled] = await fillIsLiked(supabase, [rowToPublicSong(data as unknown as SongRow)])
    return filled
  },

  // is_public 필터 없이 조회 — 알림 라우팅 등 본인 소유 비공개 곡(예: 생성 완료 직후)도 열기 위함.
  // RLS(songs_select: is_public = true OR auth.uid() = user_id)가 권한을 보장하므로
  // 타인의 비공개 곡은 여전히 null.
  async getSongById(id: string): Promise<PublicSong | null> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('songs')
      .select(SONG_SELECT)
      .eq('id', id)
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[exploreService.getSongById]', error.message)
      return null
    }
    const [filled] = await fillIsLiked(supabase, [rowToPublicSong(data as unknown as SongRow)])
    return filled
  },

  // Unlisted 공유 — `?song={id}` 딥링크 진입용. service_role API로 RLS 우회해 비공개 곡도 조회.
  // 클라이언트 anon supabase로는 RLS에 막히므로 API 라우트를 거침.
  async getShareSongById(id: string): Promise<PublicSong | null> {
    try {
      const res = await fetch(`/api/songs/${id}/share`)
      if (!res.ok) return null
      const { song } = await res.json()
      if (!song) return null
      const supabase = createClient()
      const [filled] = await fillIsLiked(supabase, [rowToPublicSong(song as SongRow)])
      return filled
    } catch (e) {
      console.error('[exploreService.getShareSongById]', e)
      return null
    }
  },

  // 공개 곡의 genre/mood 칩 — 명시 값 + prompt/title/lyrics에서 추출 합집합
  // (기존 곡들이 genre/mood NULL이어도 prompt 텍스트에서 자동 추출)
  async getAvailableTags(): Promise<{ genres: string[]; moods: string[] }> {
    const { inferTags } = await import('@/utils/extractTags')
    const supabase = createClient()
    const { data } = await supabase
      .from('songs')
      .select('genre, mood, prompt, title, lyrics')
      .eq('is_public', true)
      .limit(500)
    const genreSet = new Set<string>()
    const moodSet = new Set<string>()
    for (const row of data ?? []) {
      const r = row as { genre?: string | null; mood?: string | null; prompt?: string | null; title?: string | null; lyrics?: string | null }
      const g = r.genre?.trim()
      const m = r.mood?.trim()
      if (g) genreSet.add(g)
      else {
        const inferred = inferTags({ prompt: r.prompt, title: r.title, lyrics: r.lyrics })
        if (inferred.genre) genreSet.add(inferred.genre)
      }
      if (m) moodSet.add(m)
      else {
        const inferred = inferTags({ prompt: r.prompt, title: r.title, lyrics: r.lyrics })
        if (inferred.mood) moodSet.add(inferred.mood)
      }
    }
    return {
      genres: [...genreSet].sort((a, b) => a.localeCompare(b, 'ko')),
      moods: [...moodSet].sort((a, b) => a.localeCompare(b, 'ko')),
    }
  },

  async getPopularProfiles(limit = 12): Promise<UserProfile[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_hue, avatar_url, follower_count, following_count, song_count')
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
      followingCount: d.following_count ?? 0,
      songCount: d.song_count ?? 0,
    }))
  },
}
