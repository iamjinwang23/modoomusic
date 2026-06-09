// Unlisted 공유 모델 — songId가 UUID v4(추측 불가)라는 가정 하에 비공개 곡도 by-id 조회 허용.
// 게시(is_public=true) 곡은 탐색·프로필 노출, 비공개 곡은 링크 받은 사람만 접근.
// service_role로 RLS 우회. generating/failed 상태는 차단.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SONG_SHARE_SELECT = `
  id, title, prompt, genre, mood, instrumental, audio_url, cover_hue, cover_image, publish_cover_image,
  duration, lyrics, publish_comment, is_public, status, created_at, like_count, play_count, comment_count, user_id, model,
  profiles!songs_user_id_fkey!inner ( username, display_name, avatar_hue, avatar_url )
`

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('songs')
    .select(SONG_SHARE_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[share song]', error.message)
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const status = (data as { status?: string }).status
  if (status && status !== 'done') {
    return NextResponse.json({ error: 'not ready' }, { status: 404 })
  }
  return NextResponse.json({ song: data })
}
