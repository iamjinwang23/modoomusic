'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { CollectionPickerModal } from '@/features/song/components/CollectionPickerModal'
import { toast } from '@/components/toast/toast'
import { useAuth } from '@/components/AuthProvider'
import { buildSongShareUrl } from '@/utils/shareUrl'
import type { Song } from '@/types/domain'
import { MarqueeText } from '@/components/MarqueeText'

function formatCount(n: number) {
  if (n >= 10000) return `${+(n / 10000).toFixed(1)}만`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}

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
  const { song, feed, idx, isOwner, ownerName, ownerUserId, ownerAvatarUrl, ownerAvatarHue, hasPrev, hasNext, isPlaying, currentTime, duration, togglePlay, next, prev, seekTo, patchSong } = useGlobalPlayer()
  const { user } = useAuth()
  const trackRef = useRef<HTMLDivElement>(null)
  const likeInflight = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)

  if (!song) return null

  function openDetail() {
    if (!song) return
    window.dispatchEvent(new CustomEvent('view-song', { detail: { feed, idx, isOwner, ownerUserId, ownerName, ownerAvatarUrl, ownerAvatarHue } }))
  }

  async function handleLike() {
    if (!song || likeInflight.current) return
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    likeInflight.current = true
    const prev = !!song.liked
    const prevCount = song.likeCount ?? 0
    const next = !prev
    patchSong({ liked: next, likeCount: prevCount + (next ? 1 : -1) })
    try {
      const r = await fetch(`/api/songs/${song.id}/like`, { method: 'POST' })
      if (!r.ok) {
        if (r.status === 401) window.dispatchEvent(new Event('open-login'))
        throw new Error('like failed')
      }
      const d = await r.json()
      patchSong({ liked: d.liked, likeCount: d.likeCount })
      window.dispatchEvent(new CustomEvent('like-updated', { detail: { songId: song.id, liked: d.liked, likeCount: d.likeCount } }))
    } catch {
      patchSong({ liked: prev, likeCount: prevCount })
      toast.error('좋아요 처리에 실패했어요')
    } finally {
      likeInflight.current = false
    }
  }

  async function handleShare() {
    if (!song) return
    const title = song.title || song.prompt.slice(0, 40)
    const shareUrl = buildSongShareUrl(song.id)
    if (navigator.share) {
      await navigator.share({ title, url: shareUrl }).catch(() => {})
    } else {
      const ok = await navigator.clipboard.writeText(shareUrl).then(() => true).catch(() => false)
      if (ok) toast.success('링크가 복사되었어요')
      else toast.error('링크 복사에 실패했어요')
    }
  }
  
      const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0

  function seekFromPointer(e: React.PointerEvent) {
    const track = trackRef.current
    if (!track || !duration) return
    const rect = track.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    seekTo((x / rect.width) * duration)
  }

  return (
    <>
      <div className="relative shrink-0 bg-[#111318] border-t border-white/[0.06] select-none px-4 py-[11px] md:py-3">
        {/* 모바일 상단 프로그레스 — 탭/드래그로 시크 */}
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            setDragging(true)
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            seekFromPointer(e)
          }}
          onPointerMove={(e) => { if (dragging) seekFromPointer(e) }}
          onPointerUp={(e) => {
            setDragging(false)
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
          }}
          onPointerCancel={() => setDragging(false)}
          className="md:hidden absolute top-0 left-0 right-0 h-3 cursor-pointer touch-none"
          style={{ touchAction: 'none' }}
        >
          {/* 라인 — 드래그 중이면 두꺼워짐 */}
          <div className={`absolute top-0 left-0 right-0 bg-white/[0.08] transition-all ${dragging ? 'h-1' : 'h-[2px]'}`}>
            <div
              className="h-full bg-violet-500"
              style={{ width: `${progressPct}%`, transition: dragging ? 'none' : 'width 0.15s linear' }}
            />
          </div>
          {/* 핸들 — 드래그 중에만 표시 */}
          <div
            className={`absolute top-0 w-3 h-3 -ml-1.5 rounded-full bg-violet-500 shadow-lg shadow-violet-500/40 transition-opacity ${dragging ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: `${progressPct}%` }}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 mb-1">
          {/* Left: thumbnail + title — click opens detail */}
          <div
            className="flex items-center gap-2.5 min-w-0 overflow-hidden cursor-pointer"
            onClick={openDetail}
          >
            <div
              className="w-9 aspect-[2/3] rounded-md shrink-0 overflow-hidden relative"
              style={song.coverImage ? undefined : { background: coverGradient(song) }}
            >
              {song.coverImage && (
                <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized />
              )}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <MarqueeText
                text={song.title || 'Untitled'}
                className="text-sm font-medium text-white leading-tight"
                speed={10}
                threshold={20}
              />
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
              className="flex items-center justify-center transition-colors shrink-0 md:w-[38px] md:h-[38px] md:rounded-full md:bg-white md:hover:bg-zinc-100"
            >
              <Image
                src={isPlaying ? '/Pause.svg' : '/Play.svg'}
                alt={isPlaying ? '일시정지' : '재생'}
                width={22}
                height={22}
                className="[filter:invert(1)] md:[filter:invert(0)]"
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

          {/* Right: action buttons — 모바일에선 숨김 (곡 상세 페이지에서 사용 가능) */}
          <div className="hidden md:flex items-center gap-2 justify-end">
            {/* 재생수 */}
            <div className="flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-white/[0.06] text-xs text-zinc-400 tabular-nums">
              <Image src="/Play.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.55)' }} />
              <span>{formatCount(song.playCount ?? 0)}</span>
            </div>
            {/* Like */}
            <button
              onClick={handleLike}
              title="좋아요"
              className={`flex items-center gap-1.5 px-2.5 h-8 rounded-full transition-colors ${
                song.liked ? 'bg-white hover:bg-zinc-100' : 'bg-white/[0.06] hover:bg-white/[0.12]'
              }`}
            >
              <Image
                src="/Thumb-Up.svg"
                alt="좋아요"
                width={14}
                height={14}
                style={{ filter: song.liked ? 'invert(0)' : 'invert(0.45)' }}
              />
              <span className={`text-xs tabular-nums ${song.liked ? 'text-black' : 'text-zinc-400'}`}>
                {formatCount(song.likeCount ?? 0)}
              </span>
            </button>

            {/* Collection */}
            <button
              onClick={() => setCollectOpen(true)}
              title="컬렉션"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
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
              className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
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
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
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

        {/* 프로그레스 바 (데스크톱) — 모바일은 상단 라인이 대체 */}
        <div className="hidden md:flex items-center gap-2 max-w-[560px] mx-auto">
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
