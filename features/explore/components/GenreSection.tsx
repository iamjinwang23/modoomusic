'use client'

// 둘러보기 추천 크리에이터 아래 — 장르 칩 + 그리드 (Suno 패턴)
// 칩: 19 장르 가로 스크롤, count > 0인 것만 + count desc 정렬
// 첫 진입 기본 칩: 공개 곡 가장 많은 장르
// 더보기: 둘러보기 새로운 음악 전체보기로 진입, 해당 장르 필터 자동 적용

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { exploreService } from '@/services/explore.service'
import { GENRE_LABELS } from '@/utils/extractTags'
import { PublicSongCard } from './PublicSongCard'
import type { PublicSong, Song } from '@/types/domain'

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
    playCount: pub.playCount,
    likeCount: pub.likeCount,
    commentCount: pub.commentCount,
    publishComment: pub.publishComment,
    published: pub.published,
    model: pub.model,
    videoCoverUrl: pub.videoCoverUrl,
    videoCoverStatus: pub.videoCoverStatus,
  }
}

function dispatchView(pub: PublicSong, feed: PublicSong[], currentUserId: string | null) {
  const songs = feed.map(toSong)
  const idx = feed.findIndex((s) => s.id === pub.id)
  const isOwner = !!currentUserId && pub.userId === currentUserId
  window.dispatchEvent(new CustomEvent('view-song', {
    detail: { feed: songs, idx, isOwner, ownerUserId: pub.userId, ownerName: pub.displayName, ownerAvatarUrl: pub.avatarUrl ?? null, ownerAvatarHue: pub.avatarHue ?? null, origin: 'genre' },
  }))
}

function dispatchPlayOnly(pub: PublicSong, feed: PublicSong[], currentUserId: string | null) {
  const songs = feed.map(toSong)
  const idx = feed.findIndex((s) => s.id === pub.id)
  const isOwner = !!currentUserId && pub.userId === currentUserId
  window.dispatchEvent(new CustomEvent('play-song', {
    detail: { feed: songs, idx, isOwner, ownerUserId: pub.userId, ownerName: pub.displayName, ownerAvatarUrl: pub.avatarUrl ?? null, ownerAvatarHue: pub.avatarHue ?? null, origin: 'genre' },
  }))
}

export function GenreSection({
  currentUserId,
  onMore,
}: {
  currentUserId: string | null
  onMore: (genre: string) => void
}) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [activeGenre, setActiveGenre] = useState<string | null>(null)
  const [feed, setFeed] = useState<PublicSong[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const chipRowRef = useRef<HTMLDivElement>(null)
  // 캐러셀 가로 스크롤 (SectionCarousel과 동일)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)
  const [hovered, setHovered] = useState(false)
  const STEP = 148 + 12

  // 1. mount: 장르 카운트 fetch + 최다 장르를 기본 활성화
  useEffect(() => {
    let cancelled = false
    exploreService.getGenreCounts().then((c) => {
      if (cancelled) return
      setCounts(c)
      // GENRE_LABELS에서 '기타' 제외, count desc
      const ordered = GENRE_LABELS.filter((g) => g !== '기타' && (c[g] ?? 0) > 0)
        .sort((a, b) => (c[b] ?? 0) - (c[a] ?? 0))
      if (ordered.length > 0) setActiveGenre(ordered[0])
    })
    return () => { cancelled = true }
  }, [])

  // 2. activeGenre 변경 시 곡 fetch (6개)
  useEffect(() => {
    if (!activeGenre) return
    let cancelled = false
    setFeedLoading(true)
    // getByFilter는 fetch-then-filter 구조이므로 SectionAllView와 동일한 60 풀에서 가져와야
    // 미리보기와 전체보기 결과가 일관됨. 표시는 15개 slice (다른 섹션과 동일)
    exploreService.getByFilter('latest', [activeGenre], []).then((data) => {
      if (cancelled) return
      setFeed(data.slice(0, 15))
      setFeedLoading(false)
    })
    return () => { cancelled = true }
  }, [activeGenre])

  // 좋아요 실시간 동기화
  useEffect(() => {
    function handler(e: Event) {
      const { songId, liked, likeCount } = (e as CustomEvent<{ songId: string; liked: boolean; likeCount: number }>).detail
      setFeed((prev) => prev.map((s) => s.id === songId ? { ...s, isLiked: liked, likeCount } : s))
    }
    window.addEventListener('like-updated', handler)
    return () => window.removeEventListener('like-updated', handler)
  }, [])

  // 캐러셀 fade 그라데이션 (스크롤 위치에 따라)
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

  if (counts === null) {
    // 로딩 — 칩 스켈레톤만
    return (
      <div>
        <div className="mb-3"><p className="text-xl font-semibold text-white/50">장르로 둘러보기</p></div>
        <div className="flex gap-2 overflow-hidden mb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-16 rounded-full bg-white/[0.06] shimmer shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  // 칩: GENRE_LABELS 기준 (count > 0만), count desc로 정렬
  const chips = GENRE_LABELS.filter((g) => g !== '기타' && (counts[g] ?? 0) > 0)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))

  if (chips.length === 0 || !activeGenre) return null

  return (
    <div>
      <div className="mb-3">
        <button
          onClick={() => onMore(activeGenre)}
          className="flex items-center gap-0.5 text-xl font-semibold text-white hover:opacity-70 transition-opacity"
        >
          장르로 둘러보기
          <Image src="/Right-Line.svg" alt="" width={20} height={20} style={{ filter: 'invert(1)' }} />
        </button>
      </div>

      {/* 칩 row */}
      <div
        ref={chipRowRef}
        className="flex gap-2 overflow-x-auto pb-2 mb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {chips.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGenre(g)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition active:scale-[0.96] ${
              activeGenre === g
                ? 'bg-white text-zinc-900'
                : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* 그리드 */}
      {feedLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[150px] md:w-[200px]">
              <div className="aspect-[2/3] w-full rounded-xl bg-white/[0.04] shimmer" />
              <div className="pt-2 space-y-1.5">
                <div className="h-4 w-3/4 rounded bg-white/[0.04] shimmer" />
                <div className="h-3 w-1/2 rounded bg-white/[0.04] shimmer" />
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-3 w-8 rounded bg-white/[0.04] shimmer" />
                  <div className="h-3 w-8 rounded bg-white/[0.04] shimmer" />
                  <div className="h-3 w-8 rounded bg-white/[0.04] shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : feed.length === 0 ? (
        <p className="text-center py-8 text-zinc-500 text-sm">이 장르의 곡이 아직 없어요</p>
      ) : (
        <>
          {/* 가로 스크롤 캐러셀 (SectionCarousel과 동일 패턴) */}
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
                className="hidden md:flex absolute left-2 top-[150px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 items-center justify-center transition active:scale-90 duration-200"
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
                <div key={song.id} className="shrink-0 w-[150px] md:w-[200px]">
                  <PublicSongCard
                    song={song}
                    onPlay={(p) => dispatchView(p, feed, currentUserId)}
                    onThumbPlay={(p) => dispatchPlayOnly(p, feed, currentUserId)}
                  />
                </div>
              ))}
            </div>

            {fadeRight && (
              <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-[#111318] via-[#111318]/60 to-transparent z-10 pointer-events-none" />
            )}
            {fadeRight && hovered && (
              <button
                onClick={() => scrollBy(1)}
                className="hidden md:flex absolute right-2 top-[150px] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/35 items-center justify-center transition active:scale-90 duration-200"
              >
                <Image src="/Right-Small.svg" alt="다음" width={24} height={24} style={{ filter: 'invert(1)' }} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
