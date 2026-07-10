import { Share } from 'react-native'
import { supabase } from './supabase'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''

// 곡 공유 — 웹과 동일한 /song/{id} 링크(서버가 OG 메타 생성). RN 네이티브 공유 시트.
export async function shareSong(songId: string, title?: string | null) {
  const url = `${API_BASE}/song/${songId}`
  await Share.share({ message: title ? `${title}\n${url}` : url, url }).catch(() => {})
}

// 커뮤니티 공유 — /community/{id} 링크.
export async function shareCommunity(id: string, name?: string | null) {
  const url = `${API_BASE}/community/${id}`
  await Share.share({ message: name ? `${name}\n${url}` : url, url }).catch(() => {})
}

// 공개/비공개 토글 — songs.is_public 직접 업데이트(RLS: 소유자만). 웹 song.service 패리티.
export async function setSongPublished(songId: string, published: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('songs')
    .update({ is_public: published, published_at: published ? new Date().toISOString() : null })
    .eq('id', songId)
  return !error
}

// 곡 삭제 — songs DELETE(RLS: 소유자만). 웹 song.service 패리티.
export async function deleteSong(songId: string): Promise<boolean> {
  const { error } = await supabase.from('songs').delete().eq('id', songId)
  return !error
}
