// Design Ref: social-actions §4.1 — 팔로우 토글 + follow 알림 INSERT
// 자기 자신 follow 차단, dedupe는 follows PK가 처리
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/services/push.service'
import { getBlockedUserIds } from '@/services/block.service'

interface Params { id: string }

export async function POST(_req: Request, { params }: { params: Promise<Params> }) {
  const { id: targetUserId } = await params
  if (!targetUserId) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  // 1) 인증
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 2) 자기 자신 차단
  if (targetUserId === user.id) {
    return NextResponse.json({ error: '자기 자신은 팔로우할 수 없어요' }, { status: 400 })
  }

  // admin: cookies 없는 진짜 service-role — RLS 완전 우회 (트리거 follower_count UPDATE + notifications INSERT 통과)
  const admin = createAdminClient()

  // 차단 관계면 팔로우 불가(양방향)
  const blockedIds = await getBlockedUserIds(admin, user.id)
  if (blockedIds.includes(targetUserId)) {
    return NextResponse.json({ error: '차단한 사용자는 팔로우할 수 없어요', code: 'BLOCKED' }, { status: 403 })
  }

  // 3) 대상 프로필 확인 + actor username 한 번에 조회
  const [{ data: target }, { data: actor }] = await Promise.all([
    admin.from('profiles').select('id, follower_count').eq('id', targetUserId).maybeSingle(),
    admin.from('profiles').select('username, display_name').eq('id', user.id).maybeSingle(),
  ])
  if (!target) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 4) 기존 follow 존재 확인
  const { data: existing } = await admin
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('following_id', targetUserId)
    .maybeSingle()

  let following: boolean
  if (existing) {
    const { error } = await admin
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    following = false

    // social-actions 폭주 차단 (C) — unfollow 시 아직 읽지 않은 follow 알림 자동 정리
    // (사용자가 알림 확인 전 토글 반복하면 알림이 깔끔히 사라짐)
    await admin
      .from('notifications')
      .delete()
      .eq('user_id', targetUserId)
      .eq('type', 'follow')
      .eq('actor_id', user.id)
      .is('read_at', null)
  } else {
    const { error } = await admin
      .from('follows')
      .insert({ follower_id: user.id, following_id: targetUserId })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    following = true

    // social-actions 폭주 차단 (B) — 미읽음 follow 알림이 이미 있으면 INSERT skip
    // (사용자가 한 번 확인한 뒤 다시 팔로우하면 새 알림 OK)
    const { count: existingUnread } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetUserId)
      .eq('type', 'follow')
      .eq('actor_id', user.id)
      .is('read_at', null)

    if ((existingUnread ?? 0) === 0) {
      const { error: notifErr } = await admin
        .from('notifications')
        .insert({
          user_id: targetUserId,
          type: 'follow',
          actor_id: user.id,
          payload: { username: actor?.username ?? null },
        })
      if (notifErr) console.error('[follow notify]', notifErr.message)
      const followerUsername = actor?.username ?? null
      const actorName = actor?.display_name ?? actor?.username ?? '누군가'
      await sendPushToUser(targetUserId, {
        title: '새 팔로워',
        body: `${actorName}님이 회원님을 팔로우했어요`,
        tag: `follow-${user.id}`,
        data: { route: followerUsername ? `/creator/${followerUsername}` : '/(tabs)' },
      }, 'follow')
    }
  }

  // 5) follower_count 재조회 (트리거 갱신 반영)
  const { data: refreshed } = await admin
    .from('profiles')
    .select('follower_count')
    .eq('id', targetUserId)
    .maybeSingle()

  return NextResponse.json({ following, followerCount: refreshed?.follower_count ?? 0 })
}
