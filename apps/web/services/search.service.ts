// Design Ref: search §7.1 — 통합 검색 service (Option C)
// 단일 함수 searchAll: 곡·사용자·태그 병렬 조회 후 isLiked·isFollowing 후처리
// SQL 와일드카드(%·_) + .or() separator(,) escape로 와일드카드 오용 방지

import { createUserClient } from '@/lib/supabase/server'
import { GENRE_LABELS, MOOD_LABELS } from '@/utils/extractTags'
import { SONG_SELECT, rowToPublicSong, type SongRow } from '@/services/explore.service'
import type { PublicSong } from '@/types/domain'

// Design Ref: §3.1 — Search 결과 타입
export interface SearchUser {
  id: string
  username: string
  displayName: string
  avatarHue: number
  avatarUrl: string | null
  followerCount: number
  isFollowing?: boolean
}

export interface SearchTag {
  label: string
  type: 'genre' | 'mood'
  count: number
}

export interface SearchResults {
  songs: PublicSong[]
  users: SearchUser[]
  tags: SearchTag[]
}

const MAX_QUERY_LENGTH = 50

// Plan SC NFR: SQL 와일드카드 오용 방지 — %·_ 백슬래시 이스케이프, , 는 .or() separator
function escapeIlike(s: string): string {
  return s.replace(/[\\%_,]/g, '\\$&')
}

export async function searchAll(
  q: string,
  currentUserId: string | null,
): Promise<SearchResults> {
  const trimmed = q.trim().slice(0, MAX_QUERY_LENGTH)
  if (!trimmed) return { songs: [], users: [], tags: [] }

  const supabase = await createUserClient()
  const pattern = `%${escapeIlike(trimmed)}%`

  // Plan SC: 응답 < 300ms — 3 카테고리 병렬
  const [songs, users, tags] = await Promise.all([
    searchSongs(supabase, pattern),
    searchUsers(supabase, pattern, currentUserId),
    searchTagsWithCount(supabase, trimmed),
  ])

  // 곡 isLiked 후처리 (로그인 사용자만)
  const songsWithLikes = currentUserId
    ? await fillIsLikedServer(supabase, songs, currentUserId)
    : songs

  return { songs: songsWithLikes, users, tags }
}

// Plan SC FR-06: 제목·prompt·genre·mood ILIKE, is_public 강제
async function searchSongs(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
  pattern: string,
): Promise<PublicSong[]> {
  const { data, error } = await supabase
    .from('songs')
    .select(SONG_SELECT)
    .eq('is_public', true)
    .or(`title.ilike.${pattern},prompt.ilike.${pattern},genre.ilike.${pattern},mood.ilike.${pattern}`)
    .order('like_count', { ascending: false })
    .limit(30)
  if (error) {
    console.error('[search.searchSongs]', error.message)
    return []
  }
  return (data as unknown as SongRow[]).map(rowToPublicSong)
}

// Plan SC FR-07: username·display_name ILIKE + isFollowing 일괄 조회
async function searchUsers(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
  pattern: string,
  currentUserId: string | null,
): Promise<SearchUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_hue, avatar_url, follower_count')
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order('follower_count', { ascending: false })
    .limit(20)
  if (error) {
    console.error('[search.searchUsers]', error.message)
    return []
  }

  const users: SearchUser[] = (data ?? []).map((r) => ({
    id: r.id as string,
    username: r.username as string,
    displayName: (r.display_name as string | null) ?? (r.username as string),
    avatarHue: (r.avatar_hue as number | null) ?? 0,
    avatarUrl: r.avatar_url as string | null,
    followerCount: (r.follower_count as number | null) ?? 0,
  }))

  if (currentUserId && users.length > 0) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)
      .in('following_id', users.map((u) => u.id))
    const followed = new Set((follows ?? []).map((f) => f.following_id as string))
    users.forEach((u) => { u.isFollowing = followed.has(u.id) })
  }
  return users
}

// Plan SC FR-08: 사전 매칭 + per-tag 공개 곡 count (Promise.all 병렬)
async function searchTagsWithCount(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
  q: string,
): Promise<SearchTag[]> {
  const lower = q.toLowerCase()
  const matches: SearchTag[] = [
    ...GENRE_LABELS.filter((g) => g.toLowerCase().includes(lower))
      .map((label) => ({ label, type: 'genre' as const, count: 0 })),
    ...MOOD_LABELS.filter((m) => m.toLowerCase().includes(lower))
      .map((label) => ({ label, type: 'mood' as const, count: 0 })),
  ]
  if (matches.length === 0) return []

  await Promise.all(matches.map(async (m) => {
    const { count } = await supabase
      .from('songs')
      .select('id', { count: 'exact', head: true })
      .eq('is_public', true)
      .eq(m.type === 'genre' ? 'genre' : 'mood', m.label)
    m.count = count ?? 0
  }))
  return matches.filter((m) => m.count > 0)
}

// 서버 측 isLiked 후처리 — explore.service의 fillIsLiked는 client auth 의존이라 별도 구현
async function fillIsLikedServer(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
  songs: PublicSong[],
  userId: string,
): Promise<PublicSong[]> {
  if (songs.length === 0) return songs
  const { data: myLikes } = await supabase
    .from('likes')
    .select('song_id')
    .eq('user_id', userId)
    .in('song_id', songs.map((s) => s.id))
  const likedSet = new Set((myLikes ?? []).map((l) => l.song_id as string))
  return songs.map((s) => ({ ...s, isLiked: likedSet.has(s.id) }))
}
