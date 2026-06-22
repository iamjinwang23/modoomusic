import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

const SITE_URL = 'https://modoonorae.com'

// 곡 게시·탈퇴가 반영되도록 1시간마다 재생성 (ISR). 빌드 시 고정되면 신규 곡이 색인 안 됨.
export const revalidate = 3600

// 사이트맵 1개당 URL 상한은 50,000개. MONO 규모(공개곡 수백)에선 단일 파일로 충분.
// 곡이 4만 개를 넘기면 generateSitemaps로 분할 필요 (node_modules/next/dist/docs 참고).
const SONG_LIMIT = 45000

interface SongRow {
  id: string
  user_id: string
  created_at: string
  published_at: string | null
  publish_cover_image: string | null
  cover_image: string | null
}

interface ProfileRow {
  id: string
  username: string
  created_at: string
}

// base64/data: URL은 사이트맵 이미지로 부적합 → http(s)만 허용 (DB에 data URL이 섞여도 안전)
function httpUrl(u: string | null): string | undefined {
  return u && /^https?:\/\//.test(u) ? u : undefined
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/explore`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/create`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/policy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ]

  const admin = createAdminClient()

  // 공개 곡만: is_public=true & status='done' (생성 중·실패 곡 제외)
  const { data: songRows } = await admin
    .from('songs')
    .select('id, user_id, created_at, published_at, publish_cover_image, cover_image')
    .eq('is_public', true)
    .eq('status', 'done')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(SONG_LIMIT)

  const songs = (songRows ?? []) as SongRow[]

  const songEntries: MetadataRoute.Sitemap = songs.map((s) => {
    const cover = httpUrl(s.publish_cover_image) ?? httpUrl(s.cover_image)
    return {
      url: `${SITE_URL}/song/${s.id}`,
      lastModified: new Date(s.published_at ?? s.created_at),
      changeFrequency: 'weekly',
      priority: 0.8,
      ...(cover ? { images: [cover] } : {}),
    }
  })

  // 공개 곡을 1개 이상 가진 크리에이터만 색인 (빈 프로필 = thin content 제외).
  // 추가로 탈퇴(deleted_at)·정지(suspended_at) 계정 제외.
  const creatorIds = Array.from(new Set(songs.map((s) => s.user_id)))

  let profileEntries: MetadataRoute.Sitemap = []
  if (creatorIds.length > 0) {
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, username, created_at')
      .in('id', creatorIds)
      .is('deleted_at', null)
      .is('suspended_at', null)

    profileEntries = (profileRows ?? []).map((p: ProfileRow) => ({
      url: `${SITE_URL}/profile/${encodeURIComponent(p.username)}`,
      lastModified: new Date(p.created_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }))
  }

  return [...staticEntries, ...songEntries, ...profileEntries]
}
