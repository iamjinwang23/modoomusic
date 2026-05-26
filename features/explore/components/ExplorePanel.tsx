'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { exploreService, type FeedTab } from '@/services/explore.service'
import { useAuth } from '@/components/AuthProvider'
import { PublicSongCard } from './PublicSongCard'
import { ExploreFeedFilter } from './ExploreFeedFilter'
import type { PublicSong, Song } from '@/types/domain'

// 동적 칩으로 전환 — DB 집계 결과에서 set 구성 (SectionAllView 안에서 사용)

const HOME_SECTIONS: { id: FeedTab; label: string }[] = [
  { id: 'recommended', label: '에디터 추천' },
  { id: 'latest',      label: '새로운 음악' },
]

function toSong(pub: PublicSong): Song {
  return {
    id: pub.id,
    createdAt: pub.createdAt,
    title: pub.title,
    prompt: pub.prompt,
    genre: pub.genre,
    mood: pub.mood,
    customLyrics: null,
    lyrics: pub.lyrics,
    instrumental: pub.instrumental,
    audioUrl: pub.audioUrl,
    duration: null,
    liked: pub.isLiked,
    coverHue: pub.coverHue,
    coverImage: pub.coverImage,
  }
}

// 카드(제목/사용자 영역) 클릭 → 곡 상세 진입
function dispatchView(pub: PublicSong, feed: PublicSong[], currentUserId: string | null) {
  const songs = feed.map(toSong)
  const idx = feed.findIndex((s) => s.id === pub.id)
  const isOwner = !!currentUserId && pub.userId === currentUserId
  window.dispatchEvent(new CustomEvent('view-song', {
    detail: { feed: songs, idx, isOwner, ownerUserId: pub.userId, ownerName: pub.displayName, ownerAvatarUrl: pub.avatarUrl ?? null, ownerAvatarHue: pub.avatarHue ?? null },
  }))
}

// 썸네일 플레이 버튼 클릭 → 재생만 (페이지 전환 X)
function dispatchPlayOnly(pub: PublicSong, feed: PublicSong[], currentUserId: string | null) {
  const songs = feed.map(toSong)
  const idx = feed.findIndex((s) => s.id === pub.id)
  const isOwner = !!currentUserId && pub.userId === currentUserId
  window.dispatchEvent(new CustomEvent('play-song', {
    detail: { feed: songs, idx, isOwner, ownerUserId: pub.userId, ownerName: pub.displayName, ownerAvatarUrl: pub.avatarUrl ?? null, ownerAvatarHue: pub.avatarHue ?? null },
  }))
}

/* ── 캐러셀 섹션 ── */
function SectionCarousel({
  label,
  feed,
  onViewAll,
  currentUserId,
}: {
  label: string
  feed: PublicSong[]
  onViewAll: () => void
  currentUserId: string | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)
  const [hovered, setHovered] = useState(false)

  const STEP = 160 + 12 // card width + gap

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeRight(el.scrollWidth > el.clientWidth)
  }, [feed])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeLeft(el.scrollLeft > 4)
    setFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * STEP * 3, behavior: 'smooth' })
  }

  if (feed.length === 0) return null

  return (
    <div>
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-white">{label}</h2>
        <button
          onClick={onViewAll}
          className="text-sm text-zinc-500 hover:text-violet-400 transition-colors"
        >
          더보기
        </button>
      </div>

      {/* 수평 스크롤 + 그라데이션 + 화살표 */}
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {fadeLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-14 bg-gradient-to-r from-[#171A20] via-[#171A20]/60 to-transparent z-10 pointer-events-none" />
        )}
        {fadeLeft && hovered && (
          <button
            onClick={() => scrollBy(-1)}
            className="hidden md:flex absolute left-2 top-[150px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 items-center justify-center transition-all duration-200"
          >
            <Image src="/Left-Small.svg" alt="이전" width={24} height={24} style={{ filter: 'invert(1)' }} />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {feed.map((song) => (
            <div key={song.id} className="shrink-0 w-[160px]">
              <PublicSongCard song={song} onPlay={(p) => dispatchView(p, feed, currentUserId)} onThumbPlay={(p) => dispatchPlayOnly(p, feed, currentUserId)} />
            </div>
          ))}
        </div>

        {fadeRight && (
          <div className="absolute right-0 top-0 bottom-0 w-14 bg-gradient-to-l from-[#171A20] via-[#171A20]/60 to-transparent z-10 pointer-events-none" />
        )}
        {fadeRight && hovered && (
          <button
            onClick={() => scrollBy(1)}
            className="hidden md:flex absolute right-2 top-[150px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 items-center justify-center transition-all duration-200"
          >
            <Image src="/Right-Small.svg" alt="다음" width={24} height={24} style={{ filter: 'invert(1)' }} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ── 전체 리스트 페이지 ── */
function SectionAllView({
  tab,
  label,
  onBack,
  currentUserId,
}: {
  tab: FeedTab
  label: string
  onBack: () => void
  currentUserId: string | null
}) {
  const [filters, setFilters] = useState<string[]>([])
  const [feed, setFeed] = useState<PublicSong[]>([])
  const [loading, setLoading] = useState(true)
  const [tags, setTags] = useState<{ genres: string[]; moods: string[] }>({ genres: [], moods: [] })
  const genreSet = new Set(tags.genres)

  // 칩 fetch (1회) — 공개 곡에 실제 존재하는 genre/mood만
  useEffect(() => {
    exploreService.getAvailableTags().then(setTags)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const genres = filters.filter((f) => genreSet.has(f))
    const moods = filters.filter((f) => !genreSet.has(f))
    exploreService.getByFilter(tab, genres, moods).then((data) => {
      if (cancelled) return
      setFeed(data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [tab, filters, tags])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-5 h-14">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1L1 6.5 7 12" />
          </svg>
        </button>
        <p className="text-sm font-semibold">{label}</p>
      </div>

      <div className="shrink-0 px-5 py-3">
        <ExploreFeedFilter selected={filters} onChange={setFilters} genres={tags.genres} moods={tags.moods} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">불러오는 중…</div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-1">
            <p>{filters.length > 0 ? '해당 조건의 곡이 없어요' : '아직 공개된 곡이 없어요'}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {feed.map((song) => (
              <div key={song.id} className="w-[160px]">
                <PublicSongCard
                  song={song}
                  onPlay={(p) => dispatchView(p, feed, currentUserId)}
                  onThumbPlay={(p) => dispatchPlayOnly(p, feed, currentUserId)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 메인 ── */
export function ExplorePanel() {
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  const [allView, setAllView] = useState<{ tab: FeedTab; label: string } | null>(null)
  const [sections, setSections] = useState<Record<FeedTab, PublicSong[]>>({ recommended: [], latest: [], popular: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(HOME_SECTIONS.map((s) => exploreService.getFeed(s.id, 15)))
      .then((results) => {
        if (cancelled) return
        const next: Record<FeedTab, PublicSong[]> = { recommended: [], latest: [], popular: [] }
        HOME_SECTIONS.forEach((s, i) => { next[s.id] = results[i] })
        setSections(next)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (allView) {
    return (
      <SectionAllView
        tab={allView.tab}
        label={allView.label}
        onBack={() => setAllView(null)}
        currentUserId={currentUserId}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        불러오는 중…
      </div>
    )
  }

  const hasAny = HOME_SECTIONS.some((s) => sections[s.id].length > 0)
  if (!hasAny) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm gap-2 px-6">
        <p className="text-base text-zinc-300">아직 공개된 곡이 없어요</p>
        <p className="text-xs">첫 번째로 곡을 게시해보세요 ✨</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
      {HOME_SECTIONS.map(({ id, label }) => (
        <SectionCarousel
          key={id}
          label={label}
          feed={sections[id]}
          onViewAll={() => setAllView({ tab: id, label })}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  )
}
