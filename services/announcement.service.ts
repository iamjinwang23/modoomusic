// 공지(What's New) 공개 조회 — 서버 전용 (SSR 페이지 / API 라우트에서 사용)
// 게시(status='published') 공지는 anon도 RLS로 읽을 수 있음. 숨김은 어드민만.
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const SELECT = 'id, title, category, content, image_url, status, publish_at, created_at, updated_at'

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
