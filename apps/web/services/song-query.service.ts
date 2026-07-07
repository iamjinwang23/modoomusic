// 서버(BFF)용 곡 조회 — 앱 REST(/api/songs/mine·/[id])에서 사용. 유저 컨텍스트 client + RLS.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Song } from '@mono/shared'
import { rowToSong, type DbSong } from '@/services/song-map'

// 인증 유저의 곡 리스트(최신순). 웹 song.service.loadFromSupabase와 동일 쿼리.
export async function listMySongs(client: SupabaseClient, userId: string): Promise<Song[]> {
  const { data, error } = await client
    .from('songs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[songs.mine]', error.message); return [] }
  return (data ?? []).map((r) => rowToSong(r as DbSong))
}

// 단건 상세 — RLS가 공개/본인 접근 통제. 없거나 접근불가면 null.
export async function getSongById(client: SupabaseClient, id: string): Promise<Song | null> {
  const { data } = await client.from('songs').select('*').eq('id', id).maybeSingle()
  return data ? rowToSong(data as DbSong) : null
}
