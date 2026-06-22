// 공지(What's New) 공개 조회 — 서버 전용 (SSR 페이지 / API 라우트에서 사용)
// 게시(status='published') 공지는 anon도 RLS로 읽을 수 있음. 숨김은 어드민만.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createUserClient } from '@/lib/supabase/server'
import type { Announcement, AnnouncementCategory } from '@/types/domain'

interface AnnouncementRow {
  id: string
  title: string
  category: AnnouncementCategory
  content: string
  image_url: string | null
  status: 'published' | 'hidden'
  publish_at: string | null
  notified_at: string | null
  created_at: string
  updated_at: string
}

export function rowToAnnouncement(r: AnnouncementRow): Announcement {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    content: r.content,
    imageUrl: r.image_url,
    status: r.status,
    publishAt: r.publish_at,
    notifiedAt: r.notified_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// 어드민용 — notified_at 포함 (마이그레이션 036 필요)
export const ANNOUNCEMENT_SELECT =
  'id, title, category, content, image_url, status, publish_at, notified_at, created_at, updated_at'

// 공개(SSR)용 — notified_at 불필요. 컬럼 의존을 끊어 마이그레이션 전 배포해도 공개 페이지는 안전.
const SELECT = 'id, title, category, content, image_url, status, publish_at, created_at, updated_at'

// 공지 본문 → 알림 미리보기 텍스트 (마크다운 기호 제거 + 80자 컷).
function toNotificationBody(content: string): string {
  return content.replace(/[#*`>_~\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

// 전체(탈퇴 제외) 사용자에게 공지 알림 INSERT. admin(service-role) 클라이언트 필요.
// 이미 같은 공지 알림을 받은 유저는 제외(app-level dedupe) → 재발송해도 중복 안 됨.
export async function broadcastAnnouncementNotification(
  admin: SupabaseClient,
  ann: { id: string; title: string; content: string },
): Promise<{ sent: number }> {
  const url = `/announcements/${ann.id}`

  const { data: users, error: uErr } = await admin
    .from('profiles')
    .select('id')
    .is('deleted_at', null)
    .limit(100000)
  if (uErr) { console.error('[announcement notify] users:', uErr.message); return { sent: 0 } }

  // 이미 이 공지 알림을 받은 유저 제외 (재발송 안전)
  const { data: already } = await admin
    .from('notifications')
    .select('user_id')
    .eq('type', 'system')
    .eq('payload->>url', url)
    .limit(100000)
  const sentSet = new Set((already ?? []).map((r) => (r as { user_id: string }).user_id))

  const payload = { title: ann.title, body: toNotificationBody(ann.content), url }
  const rows = (users ?? [])
    .filter((u) => !sentSet.has((u as { id: string }).id))
    .map((u) => ({ user_id: (u as { id: string }).id, type: 'system' as const, payload }))

  let sent = 0
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000)
    const { error: nErr } = await admin.from('notifications').insert(chunk)
    if (nErr) { console.error('[announcement notify] insert:', nErr.message); break }
    sent += chunk.length
  }
  return { sent }
}

// 게시된 공지 목록 (최신순). category 지정 시 해당 카테고리만.
export async function listPublishedAnnouncements(
  category?: AnnouncementCategory,
): Promise<Announcement[]> {
  const supabase = await createUserClient()
  const nowIso = new Date().toISOString()
  // 예약 게이팅: 어드민이 공개 페이지를 봐도 미래 예약 건은 안 보이게 명시 필터
  let q = supabase
    .from('announcements')
    .select(SELECT)
    .eq('status', 'published')
    .or(`publish_at.is.null,publish_at.lte.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(100)
  if (category) q = q.eq('category', category)
  const { data, error } = await q
  if (error) {
    console.error('[announcement.service] list:', error.message)
    return []
  }
  return (data as AnnouncementRow[]).map(rowToAnnouncement)
}

// 게시된 공지 단건. 숨김/없음이면 null (anon RLS가 published만 반환).
export async function getPublishedAnnouncement(id: string): Promise<Announcement | null> {
  const supabase = await createUserClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('announcements')
    .select(SELECT)
    .eq('id', id)
    .eq('status', 'published')
    .or(`publish_at.is.null,publish_at.lte.${nowIso}`)
    .maybeSingle()
  if (error) {
    console.error('[announcement.service] get:', error.message)
    return null
  }
  return data ? rowToAnnouncement(data as AnnouncementRow) : null
}
