// Design Ref: notifications §4.1 — 좋아요 토글 + 곡 소유자에게 알림 INSERT
// 본인 좋아요 자신이면 알림 X. INSERT 한 경우만 알림 생성. dedupe는 UNIQUE INDEX가 처리
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/services/push.service'

interface Params { id: string }

export async function POST(_req: Request, { params }: { params: Promise<Params> }) {
  const { id: songId } = await params
  if (!songId) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  // 1) 인증
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 2) 곡 소유자 조회 (공개 곡만 좋아요 가능)
  // admin: cookies 없는 진짜 service-role — RLS 완전 우회 (트리거 like_count UPDATE도 통과)
  const admin = createAdminClient()
  const { data: song, error: songErr } = await admin
    .from('songs')
    .select('user_id, like_count, is_public')
    .eq('id', songId)
    .maybeSingle()
  if (songErr || !song) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!song.is_public && song.user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 3) 기존 like 존재 확인 → 토글
  const { data: existing } = await admin
    .from('likes')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('song_id', songId)
    .maybeSingle()

  let liked: boolean
  if (existing) {
    const { error } = await admin
      .from('likes')
      .delete()
      .eq('user_id', user.id)
      .eq('song_id', songId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    liked = false
  } else {
    const { error } = await admin
      .from('likes')
      .insert({ user_id: user.id, song_id: songId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    liked = true

    // 4) 알림 INSERT — 본인 곡 자기 좋아요는 제외, dedupe는 UNIQUE INDEX가 처리
    if (song.user_id !== user.id) {
      const { error: notifErr } = await admin
        .from('notifications')
        .insert({
          user_id: song.user_id,
          type: 'like',
          actor_id: user.id,
          song_id: songId,
        })
      // UNIQUE 충돌(이미 like 알림 받은 적 있음)은 무시. 그 외만 로그
      if (notifErr && !notifErr.message.includes('duplicate')) {
        console.error('[like notify]', notifErr.message)
      }
      // 첫 좋아요 알림일 때만 푸시(중복이면 스킵 — 스팸 방지)
      if (!notifErr) {
        await sendPushToUser(song.user_id, { title: '새 좋아요', body: '내 곡을 좋아했어요', url: `/?song=${songId}`, tag: `like-${songId}` })
      }
    }
  }

  // 5) 최신 like_count 반환 (트리거가 자동 업데이트하므로 재조회)
  const { data: refreshed } = await admin
    .from('songs')
    .select('like_count')
    .eq('id', songId)
    .maybeSingle()

  return NextResponse.json({ liked, likeCount: refreshed?.like_count ?? 0 })
}
