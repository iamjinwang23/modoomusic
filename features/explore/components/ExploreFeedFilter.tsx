'use client'

interface Props {
  selected: string[]
  onChange: (chips: string[]) => void
  // DB 집계 기반 — 실제 공개 곡의 genre/mood만 노출 (0건 칩 회피)
  genres: string[]
  moods: string[]
}

export function ExploreFeedFilter({ selected, onChange, genres, moods }: Props) {
  const chips = ['전체', ...genres, ...moods]

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
      {chips.map((chip: string) => {
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
