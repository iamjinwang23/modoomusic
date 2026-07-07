'use client'
// 커뮤니티 허브·전체보기 페이지 공용 카드 — 커뮤니티 카드/리스트행·인기글 카드.
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Community, CommunityPost } from '@/types/domain'

export const GRAY_COVER = '#363A47'       // 커버 기본 배경
export const GRAY_AVATAR = '#3E4250'      // 아바타 기본 배경
export const GRAY_AVATAR_TEXT = '#A8B0BC' // 아바타 이니셜 색상

function coverStyle(c: Community) {
  if (c.coverImage) return { backgroundImage: `url(${c.coverImage})`, backgroundSize: 'cover', backgroundPosition: c.coverFocus ?? 'center', backgroundRepeat: 'no-repeat' }
  return { background: GRAY_COVER }
}

export function CommunityCard({ c }: { c: Community }) {
  return (
    <Link href={`/community/${c.id}`} className="block group">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden" style={coverStyle(c)}>
        <span className="absolute inset-0 ring-1 ring-inset ring-white/[0.08] rounded-xl" />
      </div>
      <div className="mt-2.5 flex items-center gap-2.5 px-0.5">
        <div className="shrink-0 w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center text-sm font-bold" style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
          {c.avatarImage ? <img src={c.avatarImage} alt="" className="w-full h-full object-cover" /> : c.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{c.name}</p>
          <p className="text-[11px] text-zinc-400 truncate">멤버 {c.memberCount.toLocaleString()} · 새 글 {(c.recentPostCount ?? 0)}</p>
        </div>
      </div>
    </Link>
  )
}

// 순위 행(인기 커뮤니티) — 좌측 순위 배지 + 대표이미지 + 이름·멤버. 1~3위 강조.
export function CommunityRankRow({ c, rank }: { c: Community; rank: number }) {
  const top = rank <= 3
  return (
    <Link href={`/community/${c.id}`} className="flex items-center gap-3.5 py-2.5 hover:bg-white/[0.03] transition">
      <span className={`shrink-0 w-6 text-center text-base font-bold tabular-nums ${top ? 'text-violet-400' : 'text-zinc-500'}`}>{rank}</span>
      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center text-sm font-bold" style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
        {c.avatarImage ? <img src={c.avatarImage} alt="" className="w-full h-full object-cover" /> : c.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">{c.name}</p>
        <p className="text-[11px] text-zinc-400 truncate mt-0.5">멤버 {c.memberCount.toLocaleString()} · 새 글 {(c.recentPostCount ?? 0)}</p>
      </div>
    </Link>
  )
}

// 리스트 행(새로 생긴 커뮤니티 스타일)
export function CommunityListRow({ c }: { c: Community }) {
  return (
    <Link href={`/community/${c.id}`} className="flex items-center gap-3.5 py-3 hover:bg-white/[0.03] transition">
      <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center text-base font-bold" style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
        {c.avatarImage ? <img src={c.avatarImage} alt="" className="w-full h-full object-cover" /> : c.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">{c.name}</p>
        <p className="text-[11px] text-zinc-400 truncate mt-0.5">멤버 {c.memberCount.toLocaleString()} · 새 글 {(c.recentPostCount ?? 0)}</p>
      </div>
    </Link>
  )
}

// 스토리 썸네일(내 커뮤니티) — 24h 새 글 있으면 그라데이션 링, 없으면 회색 링(인스타 "안 본 스토리" 시맨틱). 가로 스크롤.
export function CommunityStoryItem({ c }: { c: Community }) {
  const hasNew = (c.recentPostCount ?? 0) > 0
  return (
    <Link href={`/community/${c.id}`} className="shrink-0 w-24 flex flex-col items-center gap-1.5 group">
      <div className={`w-24 h-24 rounded-full p-[2.5px] transition active:scale-95 ${hasNew ? 'bg-gradient-to-tr from-violet-500 to-blue-400' : 'bg-white/[0.12]'}`}>
        <div className="w-full h-full rounded-full p-[2.5px] bg-[#111318]">
          <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold" style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
            {c.avatarImage ? <img src={c.avatarImage} alt="" className="w-full h-full object-cover" /> : c.name.slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>
      <span className="w-full text-xs text-zinc-300 text-center truncate group-hover:text-white transition-colors">{c.name}</span>
    </Link>
  )
}

function getYouTubeThumb(url: string): string | null {
  try {
    const u = new URL(url)
    let vid: string | null = null
    if (u.hostname.includes('youtube.com')) vid = u.searchParams.get('v')
    else if (u.hostname === 'youtu.be') vid = u.pathname.slice(1).split('?')[0]
    return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null
  } catch { return null }
}

// 본문 첫 URL 추출 (임베드는 본문에 넣은 링크로 자동 인식)
function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : null
}

// 인기 글 카드 — 썸네일 우선순위: 첨부 이미지 → 첨부 곡 커버 → YT 썸네일 → 링크 OG → 커뮤니티 커버 → 회색
// compact=작은 카드(2열 그리드)일 때 라운드 축소
export function PopularPostCard({ p, compact = false }: { p: CommunityPost; compact?: boolean }) {
  const directThumb = (p.imageUrls && p.imageUrls[0]) || p.song?.coverImage || null
  const embedUrl = p.linkUrl || firstUrl(p.content)
  const ytThumb = embedUrl ? getYouTubeThumb(embedUrl) : null
  const [ogImage, setOgImage] = useState<string | null>(null)

  useEffect(() => {
    if (directThumb || ytThumb || !embedUrl) return
    let alive = true
    fetch(`/api/og?url=${encodeURIComponent(embedUrl)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.image) setOgImage(d.image) })
      .catch(() => {})
    return () => { alive = false }
  }, [directThumb, ytThumb, embedUrl])

  const thumb = directThumb || ytThumb || ogImage || p.communityCover || null

  return (
    <Link href={`/community/${p.communityId}?post=${p.id}`} className="block group">
      <div className={`relative aspect-[16/9] overflow-hidden ${compact ? 'rounded-lg' : 'rounded-xl'}`} style={thumb ? undefined : { background: GRAY_COVER }}>
        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
        <span className={`absolute inset-0 ring-1 ring-inset ring-white/[0.08] ${compact ? 'rounded-lg' : 'rounded-xl'}`} />
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-sm font-bold text-white line-clamp-2">{p.content || '(미디어 글)'}</p>
        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{p.communityName ?? '커뮤니티'}</p>
        <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Image src="/Thumb-Up.svg" alt="" width={11} height={11} style={{ filter: 'invert(0.4)' }} />
            {p.likeCount}
          </span>
          <span className="flex items-center gap-1">
            <Image src="/chat.svg" alt="" width={11} height={11} style={{ filter: 'invert(0.4)' }} />
            {p.commentCount}
          </span>
        </div>
      </div>
    </Link>
  )
}
