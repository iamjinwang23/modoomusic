// GET /api/notifications — 본인 알림 목록(BFF, Bearer/쿠키). RLS로 본인 row만.
// 웹은 notificationService(브라우저 클라)로 직접 조회 — 앱은 이 REST를 재사용.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import type { Notification, NotificationType, NotificationSystemPayload } from '@mono/shared'

interface Row {
  id: string
  type: NotificationType
  actor_id: string | null
  song_id: string | null
  payload: NotificationSystemPayload | Record<string, unknown> | null
  read_at: string | null
  created_at: string
  actor: { username: string | null; display_name: string | null; avatar_url: string | null; avatar_hue: number | null } | null
  song: { title: string | null; cover_image: string | null; cover_hue: number | null } | null
}

const SELECT = `
  id, type, actor_id, song_id, payload, read_at, created_at,
  actor:profiles!notifications_actor_id_fkey ( username, display_name, avatar_url, avatar_hue ),
  song:songs!notifications_song_id_fkey ( title, cover_image, cover_hue )
`

function rowToNotification(r: Row): Notification {
  return {
    id: r.id,
    type: r.type,
    actorId: r.actor_id,
    actorName: r.actor?.display_name ?? r.actor?.username ?? null,
    actorAvatarUrl: r.actor?.avatar_url ?? null,
    actorAvatarHue: r.actor?.avatar_hue ?? null,
    songId: r.song_id,
    songTitle: r.song?.title ?? null,
    songCoverImage: r.song?.cover_image ?? null,
    songCoverHue: r.song?.cover_hue ?? null,
    payload: r.payload ?? {},
    readAt: r.read_at,
    createdAt: r.created_at,
  }
}

export async function GET(_req: NextRequest) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const notifications = (data ?? []).map((r) => rowToNotification(r as unknown as Row))
  const unread = notifications.filter((n) => !n.readAt).length
  return NextResponse.json({ notifications, unread })
}
