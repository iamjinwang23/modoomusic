import { Share } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
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
// 공개 시 publishComment를 함께 저장 가능(웹 PublishModal 패리티). 미전달이면 코멘트 미변경.
export async function setSongPublished(songId: string, published: boolean, publishComment?: string | null): Promise<boolean> {
  const row: Record<string, unknown> = { is_public: published, published_at: published ? new Date().toISOString() : null }
  if (published && publishComment !== undefined) row.publish_comment = publishComment
  const { error } = await supabase.from('songs').update(row).eq('id', songId)
  return !error
}

// 곡 삭제 — songs DELETE(RLS: 소유자만). 웹 song.service 패리티.
export async function deleteSong(songId: string): Promise<boolean> {
  const { error } = await supabase.from('songs').delete().eq('id', songId)
  return !error
}

// 곡 정보 수정 — 제목·가사·공개코멘트(RLS: 소유자만). 웹 SongEditModal 패리티.
export async function updateSong(songId: string, patch: { title?: string | null; lyrics?: string | null; publishComment?: string | null }): Promise<boolean> {
  const row: Record<string, unknown> = {}
  if ('title' in patch) row.title = patch.title
  if ('lyrics' in patch) row.lyrics = patch.lyrics
  if ('publishComment' in patch) row.publish_comment = patch.publishComment
  const { error } = await supabase.from('songs').update(row).eq('id', songId)
  return !error
}

// 새 곡 배지 해제 — 재생하면 커버 좌하단 빨간점 제거(웹 clearNew 패리티, RLS: 소유자만).
export async function clearSongNew(songId: string): Promise<void> {
  await supabase.from('songs').update({ is_new: false }).eq('id', songId).then(() => {}, () => {})
}

// 오디오 다운로드 — 원격 mp3를 캐시에 받아 네이티브 공유 시트(파일 저장·다른 앱 전송). 웹 DownloadModal 패리티.
export async function downloadSong(audioUrl: string, title?: string | null): Promise<boolean> {
  try {
    const safe = (title?.trim() || 'MONO').replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ\- ]/g, '').slice(0, 60) || 'MONO'
    const dest = `${FileSystem.cacheDirectory}${safe}.mp3`
    const { uri } = await FileSystem.downloadAsync(audioUrl, dest)
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'audio/mpeg', dialogTitle: title ?? '노래 저장' })
    }
    return true
  } catch {
    return false
  }
}
