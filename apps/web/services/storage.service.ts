import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface UploadOptions {
  /** WebP 변환 + 다운스케일. AI 생성 커버 등 외부 URL에서 받은 큰 이미지 압축용 */
  toWebp?: {
    maxPx: number
    quality?: number
  }
}

// 클라이언트가 올린 파일 버퍼를 webp로 변환·다운스케일 후 업로드. 커버/대표 이미지용.
export async function uploadImageBuffer(
  buffer: Buffer,
  bucket: string,
  path: string,
  maxPx: number,
  quality = 85,
): Promise<string | null> {
  try {
    const webp = await sharp(buffer)
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer()
    const supabase = getAdminClient()
    const { error } = await supabase.storage.from(bucket).upload(path, webp, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000, immutable',
    })
    if (error) { console.error('[storage] uploadImageBuffer:', error.message); return null }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    console.error('[storage] uploadImageBuffer failed:', e)
    return null
  }
}

// 오디오 버퍼 직접 업로드 — 스트리밍 생성(부분 프리뷰·최종본)용.
// mutable=true(프리뷰): 같은 경로 덮어쓰기 반복이라 캐시 금지(클라는 ?v=로 버스트).
// mutable=false(최종본): UUID 경로 불변 파일 — 1년 immutable 캐시.
export async function uploadAudioBuffer(
  buffer: Buffer,
  bucket: string,
  path: string,
  opts: { mutable?: boolean } = {},
): Promise<string | null> {
  try {
    const supabase = getAdminClient()
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
      cacheControl: opts.mutable ? '0' : '31536000, immutable',
    })
    if (error) { console.error('[storage] uploadAudioBuffer:', error.message); return null }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    console.error('[storage] uploadAudioBuffer failed:', e)
    return null
  }
}

// 파일 삭제(베스트 에포트) — 프리뷰 정리용. 실패해도 흐름 안 막음.
export async function deleteStorageFile(bucket: string, path: string): Promise<void> {
  try {
    const supabase = getAdminClient()
    await supabase.storage.from(bucket).remove([path])
  } catch (e) {
    console.error('[storage] deleteStorageFile failed:', e)
  }
}

// MP3 재생 길이 추정 — 곡 생성은 256kbps CBR(=32000 B/s)로 고정 출력하므로
// Content-Length ÷ 32000 ≈ 초. MiniMax가 audio_length를 안 줄 때의 폴백.
const MP3_BYTES_PER_SEC = 256_000 / 8
export async function estimateMp3Duration(url: string): Promise<number | null> {
  try {
    let len = 0
    const head = await fetch(url, { method: 'HEAD' })
    len = Number(head.headers.get('content-length') ?? 0)
    if (!len) {
      const res = await fetch(url)
      if (!res.ok) return null
      len = (await res.arrayBuffer()).byteLength
    }
    if (!len) return null
    const sec = Math.round(len / MP3_BYTES_PER_SEC)
    return sec > 0 ? sec : null
  } catch {
    return null
  }
}

export async function uploadFromUrl(
  url: string,
  bucket: string,
  path: string,
  options: UploadOptions = {}
): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())

    let finalBuffer: Buffer = buffer
    let finalContentType = res.headers.get('content-type') ?? 'application/octet-stream'

    if (options.toWebp) {
      const { maxPx, quality = 85 } = options.toWebp
      finalBuffer = await sharp(buffer)
        .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer()
      finalContentType = 'image/webp'
    }

    const supabase = getAdminClient()
    // cacheControl: 1년 + immutable — URL이 UUID 기반이라 콘텐츠 절대 안 바뀜.
    // 브라우저 캐시 적극 활용 → Supabase Cached Egress 직접 절감.
    const { error } = await supabase.storage.from(bucket).upload(path, finalBuffer, {
      contentType: finalContentType,
      upsert: true,
      cacheControl: '31536000, immutable',
    })

    if (error) {
      console.error('[storage] upload error:', error.message)
      return null
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    console.error('[storage] uploadFromUrl failed:', e)
    return null
  }
}
