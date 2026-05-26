// Design Ref: notifications §4.3·§4.4 — RLS로 본인 알림만 SELECT/UPDATE
// API route 우회. Supabase 클라이언트 직접 호출
import { createClient } from '@/lib/supabase/client'
import type { Notification, NotificationType, NotificationSystemPayload } from '@/types/domain'

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

export const notificationService = {
  async list(limit = 30): Promise<Notification[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('notifications')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[notificationService.list]', error.message)
      return []
    }
    return (data ?? []).map((r) => rowToNotification(r as unknown as Row))
  },

  async unreadCount(): Promise<number> {
    const supabase = createClient()
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    if (error) {
      console.error('[notificationService.unreadCount]', error.message)
      return 0
    }
    return count ?? 0
  },

  async markAsRead(id: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) console.error('[notificationService.markAsRead]', error.message)
  },
}
