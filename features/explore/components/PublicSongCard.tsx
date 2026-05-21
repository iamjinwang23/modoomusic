'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import type { PublicSong } from '@/types/domain'

function coverGradient(hue: number) {
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

interface Props {
  song: PublicSong
  onPlay: (song: PublicSong) => void
  onThumbPlay?: (song: PublicSong) => void
}

export function PublicSongCard({ song, onPlay, onThumbPlay }: Props) {
  const [liked, setLiked] = useState(song.isLiked ?? false)
  const { song: currentSong, isPlaying } = useGlobalPlayer()
  const isThisPlaying = currentSong?.id === song.id && isPlaying
  const displayTitle = song.title || '제목 없음'

  function handleThumbClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (onThumbPlay) onThumbPlay(song)
    else onPlay(song)
  }

  function handleCardClick() {
    onPlay(song)
  }

  function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    setLiked((v) => !v)
  }

  return (
    <div onClick={handleCardClick} className="group cursor-pointer">
      {/* 썸네일 */}
      <div
        className="relative aspect-[2/3] w-full rounded-xl overflow-hidden"
        onClick={handleThumbClick}
      >
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out group-hover:scale-[1.05]"
          style={{ background: coverGradient(song.coverHue) }}
        >
          {song.coverImage && (
            <Image src={song.coverImage} alt={displayTitle} fill className="object-cover" sizes="200px" />
          )}
        </div>
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${isThisPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-80'}`}>
          <Image
            src={isThisPlaying ? '/Pause.svg' : '/Play.svg'}
            alt={isThisPlaying ? '일시정지' : '재생'}
            width={32}
            height={32}
            style={{ filter: 'invert(1)' }}
          />
        </div>
      </div>

      {/* 정보 */}
      <div className="pt-2 space-y-0.5">
        <div className="flex items-start gap-1.5 min-w-0">
          <p className="text-sm font-medium text-zinc-100 leading-snug flex-1 line-clamp-2">{displayTitle}</p>
          {song.instrumental && (
            <span className="shrink-0 mt-0.5 text-[9px] bg-white/[0.08] text-zinc-400 px-1.5 py-0.5 rounded border border-white/[0.08]">
              Instrumental
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            window.dispatchEvent(new CustomEvent('view-profile', { detail: song.username }))
          }}
          className="text-xs text-zinc-500 hover:text-violet-400 transition-colors truncate block text-left"
        >
          {song.displayName}
        </button>
        <div className="flex items-center gap-3 pt-0.5 text-xs text-zinc-500">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 transition-colors ${liked ? 'text-violet-400' : 'hover:text-zinc-300'}`}
          >
            <Image
              src="/Thumb-Up.svg"
              alt="좋아요"
              width={11}
              height={11}
              style={{ filter: liked ? 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)' : 'invert(0.45)' }}
            />
            {formatCount(song.likeCount + (liked ? 1 : 0))}
          </button>
          <span className="flex items-center gap-1">
            <Image src="/Play.svg" alt="" width={11} height={11} style={{ filter: 'invert(0.45)' }} />
            {formatCount(song.playCount)}
          </span>
        </div>
      </div>
    </div>
  )
}
