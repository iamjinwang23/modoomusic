// Design Ref: §3.4 songs 테이블 + §10 Forward Compatibility — 동기 인터페이스 유지 + 내부 Supabase 백엔드
import type { Song } from '@/types/domain'
import { createClient } from '@/lib/supabase/client'
import { inferTags } from '@/utils/extractTags'

let currentUserId: string | null = null
let cache: Song[] = []
let loaded = false
let inflightLoad: Promise<void> | null = null

interface DbSong {
  id: string
  user_id: string
  title: string | null
  prompt: string
  genre: string | null
  mood: string | null
  custom_lyrics: string | null
  lyrics: string | null
  instrumental: boolean
  audio_url: string
  duration: number | null
  liked: boolean
  cover_image: string | null
  cover_hue: number | null
  is_new: boolean
  is_public: boolean
  published_at: string | null
  publish_comment: string | null
  created_at: string
  play_count: number
  like_count: number
}

function rowToSong(r: DbSong): Song {
  return {
    id: r.id,
    createdAt: r.created_at,
    title: r.title,
    prompt: r.prompt,
    genre: r.genre,
    mood: r.mood,
    customLyrics: r.custom_lyrics,
    lyrics: r.lyrics,
    instrumental: r.instrumental,
    audioUrl: r.audio_url,
    duration: r.duration,
    liked: r.liked,
    coverImage: r.cover_image ?? undefined,
    coverHue: r.cover_hue ?? undefined,
    isNew: r.is_new,
    published: r.is_public,
    publishedAt: r.published_at ?? undefined,
    publishComment: r.publish_comment ?? undefined,
    playCount: r.play_count ?? 0,
    likeCount: r.like_count ?? 0,
  }
}

function songToRow(s: Song, userId: string): Partial<DbSong> {
  return {
    id: s.id,
    user_id: userId,
    title: s.title,
    prompt: s.prompt,
    genre: s.genre,
    mood: s.mood,
    custom_lyrics: s.customLyrics,
    lyrics: s.lyrics,
    instrumental: s.instrumental,
    audio_url: s.audioUrl,
    duration: s.duration,
    liked: s.liked ?? false,
    cover_image: s.coverImage ?? null,
    cover_hue: s.coverHue ?? 0,
    is_new: s.isNew ?? true,
    is_public: s.published ?? false,
    published_at: s.publishedAt ?? null,
    publish_comment: s.publishComment ?? null,
    created_at: s.createdAt,
  }
}

function patchToRow(p: Partial<Omit<Song, 'id' | 'createdAt'>>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if ('title' in p) out.title = p.title
  if ('prompt' in p) out.prompt = p.prompt
  if ('genre' in p) out.genre = p.genre
  if ('mood' in p) out.mood = p.mood
  if ('customLyrics' in p) out.custom_lyrics = p.customLyrics
  if ('lyrics' in p) out.lyrics = p.lyrics
  if ('instrumental' in p) out.instrumental = p.instrumental
  if ('audioUrl' in p) out.audio_url = p.audioUrl
  if ('duration' in p) out.duration = p.duration
  if ('liked' in p) out.liked = p.liked
  if ('coverImage' in p) out.cover_image = p.coverImage ?? null
  if ('coverHue' in p) out.cover_hue = p.coverHue
  if ('isNew' in p) out.is_new = p.isNew
  if ('published' in p) out.is_public = p.published
  if ('publishedAt' in p) out.published_at = p.publishedAt ?? null
  if ('publishComment' in p) out.publish_comment = p.publishComment ?? null
  return out
}

async function loadFromSupabase(): Promise<void> {
  if (!currentUserId) return
  const supabase = createClient()
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[songService.load]', error.message)
    return
  }
  cache = (data ?? []).map(rowToSong as (r: unknown) => Song)
  loaded = true
  window.dispatchEvent(new Event('song-updated'))
}

async function migrateLocalIfAny(): Promise<void> {
  if (!currentUserId || typeof window === 'undefined') return
  const key = `today-songs-${currentUserId}`
  const raw = localStorage.getItem(key)
  if (!raw) return
  let local: Song[]
  try { local = JSON.parse(raw) } catch { localStorage.removeItem(key); return }
  if (!Array.isArray(local) || local.length === 0) { localStorage.removeItem(key); return }

  const supabase = createClient()
  const rows = local.map((s) => songToRow(s, currentUserId!))
  const { error } = await supabase.from('songs').upsert(rows, { onConflict: 'id' })
  if (error) {
    console.error('[songService.migrate]', error.message)
    return
  }
  localStorage.removeItem(key)
  console.log(`[songService] migrated ${local.length} local songs to Supabase`)
}

export function setSongOwner(userId: string | null) {
  if (currentUserId === userId) return
  currentUserId = userId
  cache = []
  loaded = false
  inflightLoad = null
  if (userId && typeof window !== 'undefined') {
    inflightLoad = (async () => {
      await migrateLocalIfAny()
      await loadFromSupabase()
    })()
  }
}

export const songService = {
  getAll(): Song[] {
    if (currentUserId && !loaded && !inflightLoad) {
      inflightLoad = loadFromSupabase()
    }
    return cache.map((s) => ({
      ...s,
      duration: s.duration ?? (60 + (s.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 180)),
    }))
  },

  // notifications §4.2 — song_complete 알림이 곡 INSERT 완료를 의존하므로 await 가능하게 반환
  async save(song: Omit<Song, 'id' | 'createdAt'>): Promise<Song> {
    if (!currentUserId) throw new Error('songService.save: user not set')
    // 사용자가 명시 입력 안 한 genre/mood는 prompt·lyrics 텍스트에서 자동 추출
    // (탐색 칩 필터의 0건 칩 방지 + 분류 정확도 향상)
    const inferred = (!song.genre || !song.mood)
      ? inferTags({ prompt: song.prompt, title: song.title, lyrics: song.lyrics, customLyrics: song.customLyrics })
      : { genre: null, mood: null }
    const newSong: Song = {
      ...song,
      genre: song.genre ?? inferred.genre,
      mood:  song.mood  ?? inferred.mood,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      isNew: true,
    }
    cache = [newSong, ...cache]
    window.dispatchEvent(new Event('song-updated'))
    const supabase = createClient()
    const { error } = await supabase.from('songs').insert(songToRow(newSong, currentUserId))
    if (error) console.error('[songService.save]', error.message)
    return newSong
  },

  update(id: string, patch: Partial<Omit<Song, 'id' | 'createdAt'>>) {
    if (!currentUserId) return
    const idx = cache.findIndex((s) => s.id === id)
    if (idx === -1) return
    cache[idx] = { ...cache[idx], ...patch }
    window.dispatchEvent(new Event('song-updated'))
    const supabase = createClient()
    supabase.from('songs').update(patchToRow(patch)).eq('id', id).eq('user_id', currentUserId)
      .then(({ error }) => { if (error) console.error('[songService.update]', error.message) })
  },

  getById(id: string): Song | undefined {
    return cache.find((s) => s.id === id)
  },

  delete(id: string): Song | null {
    if (!currentUserId) return null
    const snapshot = cache.find((s) => s.id === id) ?? null
    cache = cache.filter((s) => s.id !== id)
    window.dispatchEvent(new Event('song-updated'))
    const supabase = createClient()
    supabase.from('songs').delete().eq('id', id).eq('user_id', currentUserId)
      .then(({ error }) => { if (error) console.error('[songService.delete]', error.message) })
    return snapshot
  },

  // 삭제된 곡 복원 (실행 취소)
  restore(snapshot: Song) {
    if (!currentUserId) return
    if (cache.some((s) => s.id === snapshot.id)) return
    cache = [snapshot, ...cache]
    window.dispatchEvent(new Event('song-updated'))
    const supabase = createClient()
    supabase.from('songs').insert(songToRow(snapshot, currentUserId))
      .then(({ error }) => { if (error) console.error('[songService.restore]', error.message) })
  },
}
