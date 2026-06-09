'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'

interface Props {
  selected: string[]
  onChange: (chips: string[]) => void
  // DB 집계 기반 — 실제 공개 곡의 genre/mood만 노출 (0건 칩 회피)
  genres: string[]
  moods: string[]
}

export function ExploreFeedFilter({ selected, onChange, genres, moods }: Props) {
  const chips = ['전체', ...genres, ...moods]
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function toggle(chip: string) {
    if (chip === '전체') {
      onChange([])
      return
    }
    if (selected.includes(chip)) {
      onChange(selected.filter((c) => c !== chip))
    } else {
      onChange([...selected, chip])
    }
  }

  const isAll = selected.length === 0

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollRight(el.scrollWidth > el.clientWidth + 4)
  }, [chips.length])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' })
  }

  return (
    <div className="flex items-center gap-1.5">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="이전"
          className="shrink-0 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] hover:border-white/20 flex items-center justify-center transition-colors"
        >
          <Image src="/Left-Small.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
        </button>
      )}

      <div className="relative flex-1 min-w-0">
        {canScrollLeft && (
          <div className="absolute left-0 inset-y-0 w-6 bg-gradient-to-r from-[#111318] to-transparent pointer-events-none z-10" />
        )}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {chips.map((chip: string) => {
            const active = chip === '전체' ? isAll : selected.includes(chip)
            return (
              <button
                key={chip}
                onClick={() => toggle(chip)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white text-zinc-900'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                }`}
              >
                {chip}
              </button>
            )
          })}
        </div>
        {canScrollRight && (
          <div className="absolute right-0 inset-y-0 w-6 bg-gradient-to-l from-[#111318] to-transparent pointer-events-none z-10" />
        )}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="다음"
          className="shrink-0 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] hover:border-white/20 flex items-center justify-center transition-colors"
        >
          <Image src="/Right-Small.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
        </button>
      )}
    </div>
  )
}
