'use client'

import { GENRES, type Genre } from '@/types/domain'

interface Props {
  value: string
  onChange: (genre: string) => void
}

export function GenreSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-zinc-400">장르 (선택)</label>
      <div className="flex gap-2 flex-wrap">
        {GENRES.map((g: Genre) => (
          <button
            key={g}
            type="button"
            onClick={() => onChange(value === g ? '' : g)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              value === g
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  )
}
