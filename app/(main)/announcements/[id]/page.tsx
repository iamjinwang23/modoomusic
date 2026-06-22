// What's New 공개 상세 — SSR. 썸네일 + 카테고리 칩 + 마크다운 본문.
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getPublishedAnnouncement } from '@/services/announcement.service'
import { Markdown } from '@/components/Markdown'
import { ANNOUNCEMENT_CATEGORY_LABEL } from '@/types/domain'

export const revalidate = 60

interface PageProps { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const a = await getPublishedAnnouncement(id)
  return { title: a ? `${a.title} — MONO` : "What's New — MONO" }
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default async function AnnouncementDetailPage({ params }: PageProps) {
  const { id } = await params
  const a = await getPublishedAnnouncement(id)
  if (!a) notFound()

  const chip = a.category === 'notice'
    ? 'bg-[#0070f3]/15 text-[#5b9dff]'
    : a.category === 'feature'
    ? 'bg-[#7c3aed]/15 text-[#a78bfa]'
    : 'bg-[#ff0080]/15 text-[#ff66b2]'

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-5 h-14">
        <Link
          href="/announcements"
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors text-white"
          aria-label="목록으로"
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1L1 6.5 7 12" />
          </svg>
        </Link>
        <p className="text-sm font-semibold text-white">What&apos;s New</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <article className="max-w-3xl mx-auto px-5 pt-6 pb-24">
          {a.imageUrl && (
            <div className="relative aspect-video rounded-xl overflow-hidden mb-6 bg-[#21252E]">
              <Image src={a.imageUrl} alt="" fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, 768px" priority />
            </div>
          )}
          <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${chip}`}>
            {ANNOUNCEMENT_CATEGORY_LABEL[a.category]}
          </span>
          <h1 className="mt-3 text-2xl font-bold text-white leading-snug break-words">{a.title}</h1>
          <p className="mt-2 text-xs text-zinc-500">{fmtDate(a.createdAt)}</p>
          <div className="mt-6">
            <Markdown content={a.content} variant="dark" />
          </div>
        </article>
      </div>
    </div>
  )
}
