import { createClient } from '@/lib/supabase/client'

// 파일을 WebP로 변환 + 최대 변 maxPx로 다운스케일 (캔버스 기반)
export function toWebp(file: File, maxPx: number, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/webp',
        quality,
      )
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// 곡 커버 업로드 — songs-covers 버킷의 {userId}/{songId}-{variant}.webp 경로
// upsert로 즉시 덮어씀. 캐시버스트 위해 ?v=timestamp 부가.
// variant: 일반 커버 = 'cover', 게시용 = 'publish'
//
// CropModal로 이미 crop된 Blob을 받을 수도 있음 (toWebp 생략)
export async function uploadSongCover(
  userId: string,
  songId: string,
  fileOrBlob: File | Blob,
  variant: 'cover' | 'publish' = 'cover',
): Promise<string | null> {
  try {
    const supabase = createClient()
    // Blob(이미 WebP)이면 그대로, File이면 toWebp
    const blob = fileOrBlob instanceof File
      ? await toWebp(fileOrBlob, 800)
      : fileOrBlob
    const path = `${userId}/${songId}-${variant}.webp`
    const { error } = await supabase.storage
      .from('songs-covers')
      .upload(path, blob, { upsert: true, contentType: 'image/webp' })
    if (error) {
      console.error('[song cover upload]', error.message)
      return null
    }
    const baseUrl = supabase.storage.from('songs-covers').getPublicUrl(path).data.publicUrl
    return `${baseUrl}?v=${Date.now()}`
  } catch (e) {
    console.error('[song cover upload] failed:', e)
    return null
  }
}
