'use client'

import Image from 'next/image'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle'
import { useAuth } from '@/components/AuthProvider'
import { toast } from '@/components/toast/toast'
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
  const { user } = useAuth()
  const { song: currentSong, isPlaying } = useGlobalPlayer()
  const isThisPlaying = currentSong?.id === song.id && isPlaying
  const displayTitle = song.title || '제목 없음'

  // social-actions §5.2 — 좋아요 토글: 낙관적 UI + 롤백 + inflight 차단
  const { state: liked, count: likeCount, toggle: toggleLike } = useOptimisticToggle({
    initialState: song.isLiked ?? false,
    initialCount: song.likeCount,
    guard: () => {
      if (!user) { window.dispatchEvent(new Event('open-login')); return false }
      return true
    },
    fetcher: async () => {
      const r = await fetch(`/api/songs/${song.id}/like`, { method: 'POST' })
      if (!r.ok) {
        if (r.status === 401) window.dispatchEvent(new Event('open-login'))
        throw new Error('like failed')
      }
      const d = await r.json()
      window.dispatchEvent(new CustomEvent('like-updated', { detail: { songId: song.id, liked: d.liked, likeCount: d.likeCount } }))
      return { state: d.liked, count: d.likeCount }
    },
    onError: () => toast.error('좋아요 처리에 실패했어요'),
  })

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
    toggleLike()
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
            <Image src={song.coverImage} alt={displayTitle} fill className="object-cover" sizes="160px" />
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
        <p className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2 min-w-0">
          {displayTitle}
          {song.model && (
            <span className="inline-block align-middle ml-1.5 text-[10px] font-medium text-violet-300 bg-violet-600/20 px-1.5 py-1 rounded-md leading-none">
              {`v${song.model.replace(/^music-/, '')}`}
            </span>
          )}
          {song.instrumental && (
            <span className="inline-block align-middle ml-1.5 text-[10px] font-medium text-zinc-400 bg-zinc-800 px-1.5 py-1 rounded-md leading-none border border-white/[0.06]">
              Inst.
            </span>
          )}
        </p>
        {!hideArtist && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              window.dispatchEvent(new CustomEvent('view-profile', { detail: song.username }))
            }}
            className="text-xs text-zinc-400 hover:text-white transition-colors truncate block text-left"
          >
            {song.displayName}
          </button>
        )}
        <div className="flex items-center gap-3 pt-1 text-xs text-zinc-500">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 transition-colors ${liked ? 'text-violet-400' : 'hover:text-zinc-300'}`}
          >
            <Image
              src="/Thumb-Up.svg"
              alt="좋아요"
              width={12}
              height={12}
              style={{ filter: liked ? 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)' : 'invert(0.45)' }}
            />
            {formatCount(likeCount)}
          </button>
          <span className="flex items-center gap-1">
            <Image src="/chat.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.45)' }} />
            {formatCount(song.commentCount ?? 0)}
          </span>
          <span className="flex items-center gap-1">
            <Image src="/Play.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.45)' }} />
            {formatCount(song.playCount)}
          </span>
        </div>
      </div>
    </div>
  )
}
