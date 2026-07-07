'use client'

import { MOODS, type Mood } from '@/types/domain'

interface Props {
  value: string
  onChange: (mood: string) => void
}

export function MoodSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-zinc-400">분위기 (선택)</label>
      <div className="flex gap-2 flex-wrap">
        {MOODS.map((m: Mood) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(value === m ? '' : m)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              value === m
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}
