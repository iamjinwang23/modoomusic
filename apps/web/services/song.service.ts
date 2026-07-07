// Design Ref: §3.4 songs 테이블 + §10 Forward Compatibility — 동기 인터페이스 유지 + 내부 Supabase 백엔드
import type { Song } from '@mono/shared'
import { createClient } from '@/lib/supabase/client'
import { rowToSong, type DbSong } from '@/services/song-map'

let currentUserId: string | null = null
let cache: Song[] = []
let loaded = false
let inflightLoad: Promise<void> | null = null


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
    publish_cover_image: s.publishCoverImage ?? null,
    created_at: s.createdAt,
    status: s.status ?? 'done',
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
  if ('publishCoverImage' in p) out.publish_cover_image = p.publishCoverImage ?? null
  if ('videoCoverUrl' in p) out.video_cover_url = p.videoCoverUrl ?? null
  if ('videoCoverStatus' in p) out.video_cover_status = p.videoCoverStatus ?? null
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
  // songs.liked는 레거시 컬럼 — 좋아요 API는 likes 테이블만 갱신하므로 안 채우면
  // 새로고침 시 라이브러리 하트가 항상 풀린다. 실제 좋아요 상태를 likes에서 보정.
  if (cache.length > 0) {
    const { data: myLikes } = await supabase
      .from('likes')
      .select('song_id')
      .eq('user_id', currentUserId)
      .in('song_id', cache.map((s) => s.id))
    if (myLikes) {
      const likedSet = new Set(myLikes.map((l) => l.song_id as string))
      cache = cache.map((s) => ({ ...s, liked: likedSet.has(s.id) }))
    }
  }
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

  // 첫 Supabase 로드 완료 여부. MyWorkPanel 스켈레톤 게이팅에 사용.
  isLoaded(): boolean {
    return loaded
  },

  // 서버가 status=generating으로 INSERT한 곡을 클라이언트 캐시에 합류시키는 진입점.
  // DB 단일 소스 패턴: INSERT/UPDATE는 모두 서버 책임 (또는 realtime). 여기선 캐시만.
  add(song: Song): void {
    if (cache.some((s) => s.id === song.id)) return
    cache = [song, ...cache]
    window.dispatchEvent(new Event('song-updated'))
  },

  // realtime UPDATE 이벤트로 status가 done/failed로 바뀌었을 때 캐시 patch
  applyRowPatch(id: string, patch: Partial<Song>): void {
    const idx = cache.findIndex((s) => s.id === id)
    if (idx === -1) return
    cache[idx] = { ...cache[idx], ...patch }
    window.dispatchEvent(new Event('song-updated'))
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
