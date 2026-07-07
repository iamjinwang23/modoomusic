// What's New 공개 목록 — SSR. 게시된 공지만 RLS로 노출.
import { listPublishedAnnouncements } from '@/services/announcement.service'
import { AnnouncementList } from '@/components/AnnouncementList'

export const metadata = { title: "What's New — MONO" }
export const revalidate = 60 // ISR 1분

export default async function AnnouncementsPage() {
  const items = await listPublishedAnnouncements()
  return <AnnouncementList items={items} />
}
