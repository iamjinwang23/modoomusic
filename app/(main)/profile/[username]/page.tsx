import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProfilePanel } from '@/features/explore/components/ProfilePanel'

interface Props {
  params: Promise<{ username: string }>
}

const SITE_URL = 'https://modoonorae.com'

interface ProfileMetaRow {
  display_name: string | null
  username: string | null
  bio: string | null
  avatar_url: string | null
  cover_url: string | null
  song_count: number | null
  deleted_at: string | null
  suspended_at: string | null
}

function httpUrl(u: string | null): string | undefined {
  return u && /^https?:\/\//.test(u) ? u : undefined
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('display_name, username, bio, avatar_url, cover_url, song_count, deleted_at, suspended_at')
    .eq('username', username)
    .maybeSingle()
  const p = data as ProfileMetaRow | null

  // 없거나 탈퇴·정지 계정 → 색인 제외
  if (!p || p.deleted_at || p.suspended_at) {
    return { title: '프로필', robots: { index: false, follow: false } }
  }

  const name = p.display_name || p.username || '크리에이터'
  const count = p.song_count ?? 0
  const description = p.bio?.trim()
    || `${name}님이 모두의 노래에서 만든 AI 음악${count > 0 ? ` ${count}곡` : ''}을 들어보세요.`
  const pageUrl = `${SITE_URL}/profile/${encodeURIComponent(username)}`
  const image = httpUrl(p.cover_url) ?? httpUrl(p.avatar_url) ?? `${SITE_URL}/og_image.png`

  return {
    title: name,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'profile',
      locale: 'ko_KR',
      url: pageUrl,
      siteName: '모두의 노래',
      title: `${name} · 모두의 노래`,
      description,
      images: [{ url: image, alt: name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name} · 모두의 노래`,
      description,
      images: [image],
    },
  }
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params
  return <ProfilePanel username={username} />
}
