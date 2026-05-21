'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { CollectionPickerModal } from '@/features/song/components/CollectionPickerModal'
import { songService } from '@/services/song.service'
import type { Song } from '@/types/domain'

function formatTime(s: number) {
  if (!s || isNaN(s) || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function coverGradient(song: Song) {
  const hue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

export function GlobalMiniBar() {
  const { song, feed, idx, isOwner, ownerName, ownerAvatarUrl, hasPrev, hasNext, isPlaying, currentTime, duration, togglePlay, next, prev, seekTo, patchSong } = useGlobalPlayer()
  const [collectOpen, setCollectOpen] = useState(false)

  if (!song) return null

  function openDetail() {
    if (!song) return
    window.dispatchEvent(new CustomEvent('view-song', { detail: { feed, idx, isOwner, ownerName, ownerAvatarUrl } }))
  }

  function handleLike() {
    if (!song) return
    const next = !song.liked
    patchSong({ liked: next })
    if (isOwner) {
      songService.update(song.id, { liked: next })
      window.dispatchEvent(new CustomEvent('song-updated'))
    }
  }

  async function handleShare() {
    if (!song) return
    const title = song.title || song.prompt.slice(0, 40)
    if (navigator.share) {
      await navigator.share({ title, url: song.audioUrl }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(song.audioUrl).catch(() => {})
    }
  }

  return (
    <>
      <div className="shrink-0 bg-[#111318] border-t border-white/[0.06] select-none px-4 pt-3 pb-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-1">
          {/* Left: thumbnail + title — click opens detail */}
          <div
            className="flex items-center gap-2.5 min-w-0 cursor-pointer"
            onClick={openDetail}
          >
            <div
              className="w-10 aspect-[2/3] rounded-md shrink-0 overflow-hidden relative"
              style={song.coverImage ? undefined : { background: coverGradient(song) }}
            >
              {song.coverImage && (
                <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">{song.title || 'Untitled'}</p>
              {ownerName && <p className="text-xs text-zinc-500 truncate mt-0.5">{ownerName}</p>}
            </div>
          </div>

          {/* Center: playback controls — truly centered */}
          <div className="flex items-center gap-5">
            <button
              onClick={prev}
              disabled={!hasPrev}
              className={`transition-opacity ${hasPrev ? 'hover:opacity-70' : 'opacity-30 cursor-default'}`}
            >
              <Image src="/Skip-Previous.svg" alt="이전" width={22} height={22} style={{ filter: 'invert(1)' }} />
            </button>
            <button
              onClick={togglePlay}
              className="w-[38px] h-[38px] rounded-full bg-white hover:bg-zinc-100 flex items-center justify-center transition-colors shrink-0"
            >
              <Image
                src={isPlaying ? '/Pause.svg' : '/Play.svg'}
                alt={isPlaying ? '일시정지' : '재생'}
                width={22}
                height={22}
              />
            </button>
            <button
              onClick={next}
              disabled={!hasNext}
              className={`transition-opacity ${hasNext ? 'hover:opacity-70' : 'opacity-30 cursor-default'}`}
            >
              <Image src="/Skip-Forward.svg" alt="다음" width={22} height={22} style={{ filter: 'invert(1)' }} />
            </button>
          </div>

          {/* Right: action buttons — right-aligned */}
          <div className="flex items-center gap-1 justify-end">
            {/* Like */}
            <button
              onClick={handleLike}
              title="좋아요"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                song.liked ? 'bg-white hover:bg-zinc-100' : 'hover:bg-white/[0.08]'
              }`}
            >
              <Image
                src="/Thumb-Up.svg"
                alt="좋아요"
                width={16}
                height={16}
                style={{ filter: song.liked ? 'invert(0)' : 'invert(0.45)' }}
              />
            </button>

            {/* Collection */}
            <button
              onClick={() => setCollectOpen(true)}
              title="컬렉션"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition-colors"
            >
              <Image
                src="/Collection.svg"
                alt="컬렉션"
                width={16}
                height={16}
                style={{ filter: 'invert(0.45)' }}
              />
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              title="공유"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition-colors"
            >
              <Image
                src="/Share.svg"
                alt="공유"
                width={16}
                height={16}
                style={{ filter: 'invert(0.45)' }}
              />
            </button>

            {/* More (owner only) */}
            {isOwner && (
              <button
                title="더보기"
                onClick={openDetail}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition-colors"
              >
                <Image
                  src="/More.svg"
                  alt="더보기"
                  width={16}
                  height={16}
                  style={{ filter: 'invert(0.45)' }}
                />
              </button>
            )}
          </div>
        </div>

        {/* 프로그레스 바 — 중앙 정렬, 너비 제한 */}
        <div className="flex items-center gap-2 max-w-[560px] mx-auto">
          <span className="text-xs text-zinc-500 w-7 text-right tabular-nums shrink-0">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={e => seekTo(Number(e.target.value))}
            className="flex-1 h-1 accent-violet-500 cursor-pointer"
            style={{ accentColor: '#7c3aed' }}
          />
          <span className="text-xs text-zinc-500 w-7 tabular-nums shrink-0">{formatTime(duration)}</span>
        </div>
      </div>

      {collectOpen && (
        <CollectionPickerModal song={song} onClose={() => setCollectOpen(false)} />
      )}
    </>
  )
}
