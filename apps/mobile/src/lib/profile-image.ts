import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy'
import { supabase } from './supabase'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

// 프로필 이미지 업로드 — 웹과 동일하게 profile-images/{userId}/{type}.webp 고정 경로 upsert.
// RN JS FormData가 파일 파트를 못 다뤄서 expo-file-system 바이너리 업로드로 Supabase Storage REST에 직접 PUT.
// 반환 = 캐시버스트된 public URL (실패 시 null).
export async function uploadProfileImage(uri: string, type: 'avatar' | 'cover', mime: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const userId = session?.user?.id
  if (!token || !userId) return null

  const path = `${userId}/${type}.webp`
  try {
    const res = await uploadAsync(`${SUPABASE_URL}/storage/v1/object/profile-images/${path}`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON,
        'Content-Type': mime || 'image/jpeg',
        'x-upsert': 'true',
        'cache-control': '3600',
      },
    })
    if (res.status < 200 || res.status >= 300) {
      console.warn('[profile image] upload fail', res.status, res.body)
      return null
    }
    return `${SUPABASE_URL}/storage/v1/object/public/profile-images/${path}?v=${Date.now()}`
  } catch (e) {
    console.warn('[profile image] network', e)
    return null
  }
}

// 곡 커버 업로드 — 웹 uploadSongCover 파리티. songs-covers/{userId}/{songId}-cover.webp upsert.
// 반환 = 캐시버스트된 public URL (실패 시 null).
export async function uploadSongCover(songId: string, uri: string, mime: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const userId = session?.user?.id
  if (!token || !userId) return null

  const path = `${userId}/${songId}-cover.webp`
  try {
    const res = await uploadAsync(`${SUPABASE_URL}/storage/v1/object/songs-covers/${path}`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON,
        'Content-Type': mime || 'image/jpeg',
        'x-upsert': 'true',
        'cache-control': '3600',
      },
    })
    if (res.status < 200 || res.status >= 300) {
      console.warn('[song cover] upload fail', res.status, res.body)
      return null
    }
    return `${SUPABASE_URL}/storage/v1/object/public/songs-covers/${path}?v=${Date.now()}`
  } catch (e) {
    console.warn('[song cover] network', e)
    return null
  }
}
