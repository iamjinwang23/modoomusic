// What's New 공개 목록 — 카테고리 칩 필터 + 격자 카드(이미지+카테고리+제목+미리보기)
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { Announcement, AnnouncementCategory } from '@mono/shared'
import { ANNOUNCEMENT_CATEGORY_LABEL } from '@mono/shared'

type Filter = 'all' | AnnouncementCategory

const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'notice', label: '공지' },
  { key: 'feature', label: '새로운 기능' },
  { key: 'promotion', label: '프로모션' },
]

// 카테고리 칩 색 (다크 배경) — 브랜드 팔레트
function chipClass(cat: AnnouncementCategory): string {
  if (cat === 'notice') return 'bg-[#0070f3]/15 text-[#5b9dff]'
  if (cat === 'feature') return 'bg-[#7c3aed]/15 text-[#a78bfa]'
  return 'bg-[#ff0080]/15 text-[#ff66b2]'
}

// 마크다운 문법 제거 → 미리보기 평문
function preview(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')   // 이미지
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 → 텍스트
    .replace(/[#*`>_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function AnnouncementList({ items }: { items: Announcement[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((a) => a.category === filter)),
    [items, filter],
  )

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-5 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-white">공지사항</h1>
        <p className="text-sm text-zinc-400 mt-1">새로운 소식과 업데이트를 확인하세요</p>
        <div className="flex gap-2 mt-4">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === c.key
                  ? 'bg-white text-zinc-900'
                  : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
        {filtered.length === 0 ? (
          <div className="text-center text-zinc-500 py-20 text-sm">아직 등록된 소식이 없어요</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => (
              <Link
                key={a.id}
                href={`/announcements/${a.id}`}
                className="group block"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-[#21252E] to-[#161922]">
                  {a.imageUrl && (
                    <Image
                      src={a.imageUrl}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  )}
                </div>
                <div className="pt-3">
                  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${chipClass(a.category)}`}>
                    {ANNOUNCEMENT_CATEGORY_LABEL[a.category]}
                  </span>
                  <h2 className="mt-2 text-[15px] font-semibold text-white line-clamp-2 leading-snug">{a.title}</h2>
                  <p className="mt-1.5 text-[13px] text-zinc-400 line-clamp-2 leading-relaxed">{preview(a.content)}</p>
                  <p className="mt-2.5 text-[11px] text-zinc-600">{fmtDate(a.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
