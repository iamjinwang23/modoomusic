// 공유 링크 전용 라우트 — generateMetadata로 곡별 OG 메타 동적 생성
// 카카오톡·페이스북 등 크롤러는 이 페이지의 HTML head를 읽어 곡 커버·제목 미리보기 표시.
// 실제 사용자는 client 마운트 시 /?song={id}로 즉시 redirect돼 SPA 경험 유지.

import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { SongShareRedirect } from './SongShareRedirect'

interface Props {
  params: Promise<{ id: string }>
}

const SITE_URL = 'https://modoonorae.com'

interface SongMetaRow {
  id: string
  title: string | null
  prompt: string | null
  cover_image: string | null
  publish_cover_image: string | null
  publish_comment: string | null
  status: string | null
  profiles: { display_name: string | null; username: string | null } | null
}

async function fetchSongMeta(id: string): Promise<SongMetaRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('songs')
    .select(`
      id, title, prompt, cover_image, publish_cover_image, publish_comment, status,
      profiles!songs_user_id_fkey ( display_name, username )
    `)
    .eq('id', id)
    .maybeSingle()
  return data as unknown as SongMetaRow | null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const song = await fetchSongMeta(id)

  // 곡 없거나 생성 미완료면 기본 메타
  if (!song || (song.status && song.status !== 'done')) {
    return {
      title: '모두의 노래',
      description: 'AI 음악 크리에이티브 플랫폼',
    }
  }

  const title = song.title || '제목 없는 곡'
  const author = song.profiles?.display_name || song.profiles?.username || '모두의 노래'
  const cover = song.publish_cover_image || song.cover_image  // 게시 커버 우선
  const description = song.publish_comment || song.prompt || `${author}님이 만든 음악을 들어보세요`
  const pageUrl = `${SITE_URL}/song/${id}`
  const fullTitle = `${title} — ${author}`

  return {
    title: fullTitle,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: 'music.song',
      locale: 'ko_KR',
      url: pageUrl,
      siteName: '모두의 노래',
      title: fullTitle,
      description,
      images: cover
        ? [{ url: cover, alt: fullTitle, width: 1200, height: 1200 }]
        : [{ url: `${SITE_URL}/og_image.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: cover ? [cover] : [`${SITE_URL}/og_image.png`],
    },
  }
}

export default async function SongSharePage({ params }: Props) {
  const { id } = await params
  return <SongShareRedirect songId={id} />
}
