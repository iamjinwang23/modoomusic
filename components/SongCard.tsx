'use client'

import { useState } from 'react'
import type { Song } from '@/types/domain'

interface Props {
  song: Song
  onDelete: (id: string) => void
}

export function SongCard({ song, onDelete }: Props) {
  const [playing, setPlaying] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const date = new Date(song.createdAt).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="bg-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-500">{date}</p>
          <p className="text-sm text-white mt-0.5 line-clamp-2">{song.prompt}</p>
        </div>
        <div className="flex gap-1" />
      </div>

      <div className="flex items-center gap-2">
        <audio
          src={song.audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          controls
          className="flex-1 h-8"
          style={{ colorScheme: 'dark' }}
        />
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="text-zinc-600 hover:text-red-400 transition-colors text-xs"
            title="삭제"
          >
            ✕
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={() => onDelete(song.id)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              삭제
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              취소
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
