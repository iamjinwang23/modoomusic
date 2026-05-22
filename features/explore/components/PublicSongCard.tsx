'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
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
  // 프로필 페이지처럼 작성자가 이미 명확한 화면에선 artist 라인 숨김
  hideArtist?: boolean
}

export function PublicSongCard({ song, onPlay, onThumbPlay, hideArtist = false }: Props) {
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
        {isThisPlaying ? (
          <>
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <SoundWaveIcon size={32} />
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 opacity-0 group-hover:opacity-80">
            <Image src="/Play.svg" alt="재생" width={32} height={32} style={{ filter: 'invert(1)' }} />
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="pt-2 space-y-1">
        <div className="flex items-start gap-1.5 min-w-0">
          <p className="text-sm font-medium text-zinc-100 leading-snug flex-1 line-clamp-2">{displayTitle}</p>
          {song.instrumental && (
            <span className="shrink-0 mt-0.5 text-[9px] bg-white/[0.08] text-zinc-400 px-1.5 py-0.5 rounded border border-white/[0.08]">
              Instrumental
            </span>
          )}
        </div>
        {!hideArtist && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              window.dispatchEvent(new CustomEvent('view-profile', { detail: song.username }))
            }}
            className="text-sm text-zinc-400 hover:text-white transition-colors truncate block text-left"
          >
            {song.displayName}
          </button>
        )}
        <div className="flex items-center gap-3 pt-1 text-sm text-zinc-500">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1.5 transition-colors ${liked ? 'text-violet-400' : 'hover:text-zinc-300'}`}
          >
            <Image
              src="/Thumb-Up.svg"
              alt="좋아요"
              width={14}
              height={14}
              style={{ filter: liked ? 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)' : 'invert(0.45)' }}
            />
            {formatCount(song.likeCount + (liked ? 1 : 0))}
          </button>
          <span className="flex items-center gap-1.5">
            <Image src="/Play.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.45)' }} />
            {formatCount(song.playCount)}
          </span>
        </div>
      </div>
    </div>
  )
}
