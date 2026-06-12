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
