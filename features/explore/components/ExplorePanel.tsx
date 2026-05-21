'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { exploreService, type FeedTab } from '@/services/explore.service'
import { PublicSongCard } from './PublicSongCard'
import { ExploreFeedFilter } from './ExploreFeedFilter'
import type { PublicSong, Song } from '@/types/domain'

const GENRE_SET = new Set(['발라드', '팝', 'R&B', '힙합', '재즈', '포크'])

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
  }
}

function dispatchPlay(pub: PublicSong, feed: PublicSong[]) {
  const songs = feed.map(toSong)
  const idx = feed.findIndex((s) => s.id === pub.id)
  window.dispatchEvent(new CustomEvent('view-song', {
    detail: { feed: songs, idx, isOwner: false },
  }))
}

/* ── 캐러셀 섹션 ── */
function SectionCarousel({
  label,
  feed,
  onViewAll,
}: {
  label: string
  feed: PublicSong[]
  onViewAll: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)
  const [hovered, setHovered] = useState(false)

  const STEP = 200 + 12 // card width + gap

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

  return (
    <div>
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-zinc-200">{label}</h2>
        <button
          onClick={onViewAll}
          className="text-xs text-zinc-500 hover:text-violet-400 transition-colors"
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
        {/* 좌측 그라데이션 + 화살표 */}
        {fadeLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-14 bg-gradient-to-r from-[#111111] via-[#111111]/60 to-transparent z-10 pointer-events-none" />
        )}
        {fadeLeft && hovered && (
          <button
            onClick={() => scrollBy(-1)}
            className="absolute left-2 top-[150px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition-all duration-200"
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
            <div key={song.id} className="shrink-0 w-[200px]">
              <PublicSongCard song={song} onPlay={(p) => dispatchPlay(p, feed)} />
            </div>
          ))}
        </div>

        {/* 우측 그라데이션 + 화살표 */}
        {fadeRight && (
          <div className="absolute right-0 top-0 bottom-0 w-14 bg-gradient-to-l from-[#111111] via-[#111111]/60 to-transparent z-10 pointer-events-none" />
        )}
        {fadeRight && hovered && (
          <button
            onClick={() => scrollBy(1)}
            className="absolute right-2 top-[150px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center transition-all duration-200"
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
}: {
  tab: FeedTab
  label: string
  onBack: () => void
}) {
  const [filters, setFilters] = useState<string[]>([])

  const feed = (() => {
    const genres = filters.filter((f) => GENRE_SET.has(f))
    const moods = filters.filter((f) => !GENRE_SET.has(f))
    return exploreService.getByFilter(tab, genres, moods)
  })()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="shrink-0 flex items-center gap-3 px-5 h-14 border-b border-white/[0.06]">
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

      {/* 필터 */}
      <div className="shrink-0 px-5 py-3 border-b border-white/[0.06]">
        <ExploreFeedFilter selected={filters} onChange={setFilters} />
      </div>

      {/* 그리드 */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {feed.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            해당 조건의 곡이 없어요
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {feed.map((song) => (
              <div key={song.id} className="w-[200px]">
                <PublicSongCard
                  song={song}
                  onPlay={(p) => dispatchPlay(p, feed)}
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
  const [allView, setAllView] = useState<{ tab: FeedTab; label: string } | null>(null)

  if (allView) {
    return (
      <SectionAllView
        tab={allView.tab}
        label={allView.label}
        onBack={() => setAllView(null)}
      />
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
      {HOME_SECTIONS.map(({ id, label }) => {
        const feed = exploreService.getFeed(id).slice(0, 15)
        return (
          <SectionCarousel
            key={id}
            label={label}
            feed={feed}
            onViewAll={() => setAllView({ tab: id, label })}
          />
        )
      })}
    </div>
  )
}
