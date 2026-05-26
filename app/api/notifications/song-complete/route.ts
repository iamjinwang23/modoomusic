// Design Ref: notifications §4.2 — 곡 생성 완료 알림
// useSongGeneration이 곡을 DB에 저장한 직후 songId와 함께 호출
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const { songId } = await req.json().catch(() => ({ songId: null }))
  if (!songId || typeof songId !== 'string') {
    return NextResponse.json({ error: 'invalid songId' }, { status: 400 })
  }

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // admin: cookies 없는 진짜 service-role — notifications RLS INSERT 정책 우회
  const admin = createAdminClient()

  // 본인이 소유한 곡인지 검증 (스푸핑 방지)
  const { data: song } = await admin
    .from('songs')
    .select('user_id')
    .eq('id', songId)
    .maybeSingle()
  if (!song || song.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { error } = await admin
    .from('notifications')
    .insert({ user_id: user.id, type: 'song_complete', song_id: songId })
  if (error) {
    console.error('[song-complete notify]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
