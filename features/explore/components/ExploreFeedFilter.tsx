'use client'

import { EXPLORE_FILTER_CHIPS } from '@/features/explore/mock/explore.mock'

const GENRE_CHIPS = ['발라드', '팝', 'R&B', '힙합', '재즈', '포크']
const MOOD_CHIPS = ['잔잔한', '신나는', '감성적', '몽환적', '그리운', '밝은', '우울한', '따뜻한']

interface Props {
  selected: string[]
  onChange: (chips: string[]) => void
}

export function ExploreFeedFilter({ selected, onChange }: Props) {
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

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {EXPLORE_FILTER_CHIPS.map((chip) => {
        const active = chip === '전체' ? isAll : selected.includes(chip)
        return (
          <button
            key={chip}
            onClick={() => toggle(chip)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              active
                ? 'bg-violet-600 border-violet-600 text-white'
                : 'border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/20'
            }`}
          >
            {chip}
          </button>
        )
      })}
    </div>
  )
}
