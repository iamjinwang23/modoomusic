'use client'

// Design Ref: recommended-creators §5 — 추천 크리에이터 캐러셀
// "새로운 음악" 섹션 아래 노출. SectionCarousel 패턴 차용.
// 카드: 원형 아바타 + 이름 + 팔로워 수 + 1탭 팔로우 버튼

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle'
import { profileColor } from '@/utils/profileColor'
import { track, EVENTS } from '@/utils/analytics'
import type { RecommendedCreator } from '@/types/domain'

function CreatorCard({ creator, position }: { creator: RecommendedCreator; position: number }) {
  const { user } = useAuth()
  // Plan SC: 팔로우 버튼 즉시 "팔로잉" 회색 전환 (useOptimisticToggle)
  const { state: following, count: followerCount, toggle } = useOptimisticToggle({
    initialState: false,
    initialCount: creator.followerCount,
    guard: () => {
      if (!user) { window.dispatchEvent(new Event('open-login')); return false }
      return true
    },
    fetcher: async () => {
      const r = await fetch(`/api/profiles/${creator.id}/follow`, { method: 'POST' })
      if (!r.ok) {
        if (r.status === 401) window.dispatchEvent(new Event('open-login'))
        throw new Error('follow failed')
      }
      const d = await r.json()
      // Plan SC FR-06: 팔로우 성공 시 creator_follow (source: 'recommended')
      if (d.following) {
        track(EVENTS.CREATOR_FOLLOW, { source: 'recommended', target_user_id: creator.id })
      }
      return { state: d.following, count: d.followerCount }
    },
  })

  const initial = (creator.displayName || creator.username).slice(0, 1).toUpperCase()
  const color = profileColor(creator.avatarHue)

  function openProfile() {
    // Plan SC FR-07: recommended_creator_click (bucket, position, target_user_id)
    track(EVENTS.RECOMMENDED_CREATOR_CLICK, {
      bucket: creator.bucket ?? 2,
      position,
      target_user_id: creator.id,
    })
    window.dispatchEvent(new CustomEvent('view-profile', { detail: creator.username }))
  }

  return (
    <div className="shrink-0 w-[140px] md:w-[160px] flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
      <button type="button" onClick={openProfile} className="block">
        <div
          className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden flex items-center justify-center"
          style={{ background: color.bg }}
        >
          {creator.avatarUrl ? (
            <Image src={creator.avatarUrl} alt={creator.displayName} fill className="object-cover" sizes="96px" unoptimized />
          ) : (
            <span className="text-2xl font-semibold text-white">{initial}</span>
          )}
          {/* 가장자리 라인 — 좌측 패널 라인색 */}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/[0.08]" />
        </div>
      </button>

      <button type="button" onClick={openProfile} className="w-full text-center min-w-0">
        <p className="text-sm font-semibold text-white truncate">{creator.displayName}</p>
        <p className="text-xs text-zinc-400 mt-0.5">팔로워 {followerCount}</p>
      </button>

      <button
        onClick={(e) => { e.preventDefault(); toggle() }}
        aria-pressed={following}
        className={`w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition active:scale-[0.96] ${
          following
            ? 'bg-white/[0.12] text-zinc-300 hover:bg-white/[0.18]'
            : 'bg-violet-600 text-white hover:bg-violet-500'
        }`}
      >
        <Image
          src={following ? '/Following.svg' : '/Follow.svg'}
          alt=""
          width={14}
          height={14}
          style={{ filter: 'invert(1)' }}
        />
        {following ? '팔로잉' : '팔로우'}
      </button>
    </div>
  )
}

function CreatorCardSkeleton() {
  return (
    <div className="shrink-0 w-[140px] md:w-[160px] flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.04]">
      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/[0.06] shimmer" />
      <div className="h-3 w-3/4 rounded bg-white/[0.06] shimmer" />
      <div className="h-2.5 w-1/2 rounded bg-white/[0.06] shimmer" />
      <div className="h-9 w-full rounded-full bg-white/[0.06] shimmer mt-1" />
    </div>
  )
}

export function RecommendedCreators() {
  const [creators, setCreators] = useState<RecommendedCreator[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)
  const [hovered, setHovered] = useState(false)
  const STEP = 140 + 12

  useEffect(() => {
    let cancelled = false
    fetch('/api/explore/recommended-creators')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setCreators((d.data as RecommendedCreator[]) ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setCreators([])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeRight(el.scrollWidth > el.clientWidth)
  }, [creators])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeLeft(el.scrollLeft > 4)
    setFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * STEP * 3, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div>
        <div className="mb-3">
          <p className="text-xl font-semibold text-white/50">추천 크리에이터</p>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => <CreatorCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  // Plan SC: 빈 결과 시 섹션 숨김
  if (creators.length === 0) return null

  return (
    <div>
      <div className="mb-3">
        <p className="text-xl font-semibold text-white">추천 크리에이터</p>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {fadeLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#111318] via-[#111318]/60 to-transparent z-10 pointer-events-none" />
        )}
        {fadeLeft && hovered && (
          <button
            onClick={() => scrollBy(-1)}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 items-center justify-center transition active:scale-90 duration-200"
          >
            <Image src="/Left-Small.svg" alt="이전" width={24} height={24} style={{ filter: 'invert(1)' }} />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {creators.map((c, i) => <CreatorCard key={c.id} creator={c} position={i} />)}
        </div>

        {fadeRight && (
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-[#111318] via-[#111318]/60 to-transparent z-10 pointer-events-none" />
        )}
        {fadeRight && hovered && (
          <button
            onClick={() => scrollBy(1)}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 items-center justify-center transition active:scale-90 duration-200"
          >
            <Image src="/Right-Small.svg" alt="다음" width={24} height={24} style={{ filter: 'invert(1)' }} />
          </button>
        )}
      </div>
    </div>
  )
}
