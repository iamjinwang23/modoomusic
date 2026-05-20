'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import { useAuth } from '@/components/AuthProvider'
import type { Song } from '@/types/domain'

interface SongProfile {
  displayName: string
  username: string
  avatarHue?: number
}

interface Props {
  song: Song
  isOwner: boolean
  onBack: () => void
  onPrev?: () => void
  onNext?: () => void
  profile?: SongProfile
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  const week = Math.floor(day / 7)
  if (week < 5) return `${week}주 전`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month}개월 전`
  return `${Math.floor(day / 365)}년 전`
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
  return `linear-gradient(160deg, hsl(${hue},70%,50%) 0%, hsl(${h2},60%,35%) 60%, hsl(${(h2 + 40) % 360},50%,24%) 100%)`
}

export function SongDetailPage({ song, isOwner, onBack, onPrev, onNext, profile }: Props) {
  const { user } = useAuth()
  const [following, setFollowing] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [songData, setSongData] = useState(song)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pendingPlayRef = useRef(false)

  useEffect(() => {
    setSongData(song)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.load()
    }
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [song.id])

  useEffect(() => {
    function handler(e: Event) {
      const id = (e as CustomEvent<string>).detail
      if (id !== song.id) { audioRef.current?.pause(); setPlaying(false) }
    }
    window.addEventListener('audio-play', handler)
    return () => window.removeEventListener('audio-play', handler)
  }, [song.id])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else {
      audio.play()
      setPlaying(true)
      window.dispatchEvent(new CustomEvent('audio-play', { detail: song.id }))
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    const t = Number(e.target.value)
    audio.currentTime = t
    setCurrentTime(t)
  }

  function handleLike() {
    const next = !songData.liked
    setSongData((prev) => ({ ...prev, liked: next }))
    if (isOwner) songService.update(song.id, { liked: next })
  }

  async function handleShare() {
    const title = songData.title || songData.prompt.slice(0, 40)
    if (navigator.share) await navigator.share({ title, url: song.audioUrl }).catch(() => {})
    else await navigator.clipboard.writeText(song.audioUrl).catch(() => {})
  }

  function handleDelete() {
    if (isOwner) {
      songService.delete(song.id)
      window.dispatchEvent(new CustomEvent('song-updated'))
    }
    setConfirmDelete(false)
    onBack()
  }

  function handlePrev() { pendingPlayRef.current = true; onPrev?.() }
  function handleNext() { pendingPlayRef.current = true; onNext?.() }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const displayTitle = songData.title || 'Untitled'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 헤더 */}
      <div className="shrink-0 flex items-center gap-3 px-5 h-14 border-b border-white/[0.06]">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1L1 6.5 7 12" />
          </svg>
        </button>
        <p className="text-sm font-medium text-zinc-200 truncate">{displayTitle}</p>
      </div>

      {/* 본문 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 좌측 — 커버 + 액션 */}
        <div className="w-[240px] shrink-0 flex flex-col p-5 gap-4">
          <div
            onClick={togglePlay}
            className="relative w-full rounded-2xl overflow-hidden cursor-pointer group"
            style={{ background: coverGradient(songData), aspectRatio: '200 / 262' }}
          >
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 bg-black/20 ${playing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <Image
                src={playing ? '/Pause.svg' : '/Play.svg'}
                alt={playing ? '일시정지' : '재생'}
                width={36}
                height={36}
                style={{ filter: 'invert(1)' }}
              />
            </div>
          </div>
          {(() => {
            const name = profile?.displayName ?? user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null
            const hue = profile?.avatarHue ?? (user ? (user.id.charCodeAt(0) * 137) % 360 : 0)
            if (!name) return null
            return (
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: `hsl(${hue},60%,45%)` }}
                >
                  {name.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-sm text-zinc-300 truncate">{name}</span>
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => setFollowing((v) => !v)}
                    className={`shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
                      following
                        ? 'bg-white/[0.08] text-zinc-400 hover:bg-white/[0.12]'
                        : 'bg-violet-600 hover:bg-violet-500 text-white'
                    }`}
                  >
                    {following ? '팔로잉' : '팔로우'}
                  </button>
                )}
              </div>
            )
          })()}
          <p className="text-xs text-zinc-500">{relativeTime(song.createdAt)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionBtn title="좋아요" icon="/Thumb-Up.svg" active={!!songData.liked} onClick={handleLike} />
            <ActionBtn title="공유" icon="/Share.svg" onClick={handleShare} />
            <ActionBtn title="저장" icon="/Arrow-To-Down.svg" />
            {isOwner && (
              <OwnerMenu
                onEdit={() => setEditOpen(true)}
                onDelete={() => setConfirmDelete(true)}
              />
            )}
          </div>
        </div>

        {/* 우측 — 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto py-5 pr-6 pl-1">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-2xl font-bold text-white leading-snug">{displayTitle}</h2>
            {songData.instrumental && (
              <span className="shrink-0 text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded border border-white/[0.06] leading-none">
                Instrumental
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">스타일</p>
            <CopyBtn text={songData.prompt} />
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed mb-8">{songData.prompt}</p>

          {songData.mood && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-white/[0.06]">
                {songData.mood}
              </span>
            </div>
          )}

          {songData.lyrics && (
            <>
              <div className="flex items-center gap-1.5 mb-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">가사</p>
                <CopyBtn text={songData.lyrics!} />
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-[1.9] font-[family-name:var(--font-pretendard)]">
                {songData.lyrics}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 플레이어 */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#141416] px-6 pt-4 pb-5">
        <audio
          ref={audioRef}
          src={song.audioUrl}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onCanPlay={() => {
            if (pendingPlayRef.current) {
              pendingPlayRef.current = false
              audioRef.current?.play().then(() => {
                setPlaying(true)
                window.dispatchEvent(new CustomEvent('audio-play', { detail: song.id }))
              }).catch(() => {})
            }
          }}
          onEnded={() => setPlaying(false)}
        />
        <div className="flex items-center justify-center gap-6 mb-3">
          <button onClick={handlePrev} disabled={!onPrev} className={`transition-opacity ${onPrev ? 'hover:opacity-70' : 'opacity-25 cursor-default'}`}>
            <Image src="/Skip-Previous.svg" alt="이전" width={24} height={24} style={{ filter: 'invert(0.55)' }} />
          </button>
          <button onClick={togglePlay} className="w-12 h-12 rounded-full bg-white hover:bg-zinc-100 flex items-center justify-center transition-colors">
            <Image src={playing ? '/Pause.svg' : '/Play.svg'} alt={playing ? '일시정지' : '재생'} width={26} height={26} />
          </button>
          <button onClick={handleNext} disabled={!onNext} className={`transition-opacity ${onNext ? 'hover:opacity-70' : 'opacity-25 cursor-default'}`}>
            <Image src="/Skip-Forward.svg" alt="다음" width={24} height={24} style={{ filter: 'invert(0.55)' }} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 w-8 text-right tabular-nums">{formatTime(currentTime)}</span>
          <input
            type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-0.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            style={{ background: `linear-gradient(to right, #fff ${progress}%, #3f3f46 ${progress}%)` }}
          />
          <span className="text-xs text-zinc-500 w-8 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      {editOpen && (
        <SongEditModal
          song={songData}
          onClose={() => {
            setEditOpen(false)
            if (isOwner) {
              const updated = songService.getById(song.id)
              if (updated) setSongData(updated)
            }
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div className="relative bg-[#1c1c1e] border border-white/[0.08] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
            <p className="text-sm font-semibold text-white mb-1">삭제하시겠어요?</p>
            <p className="text-xs text-zinc-400 mb-5 truncate">"{displayTitle}"</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors">아니요</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">네</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="복사"
      className="p-1 rounded transition-opacity opacity-40 hover:opacity-100"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      ) : (
        <Image src="/Copy.svg" alt="복사" width={15} height={15} style={{ filter: 'invert(0.6)' }} />
      )}
    </button>
  )
}

function ActionBtn({ title, icon, active, onClick }: { title: string; icon: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-white hover:bg-zinc-100' : 'bg-white/[0.06] hover:bg-white/[0.12]'
      }`}
    >
      <Image src={icon} alt={title} width={18} height={18} style={{ filter: active ? 'invert(0)' : 'invert(0.55)' }} />
    </button>
  )
}

function OwnerMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
      >
        <Image src="/More.svg" alt="더보기" width={18} height={18} style={{ filter: 'invert(0.55)' }} />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-2 bg-[#2a2a2c] border border-white/[0.08] rounded-xl py-1 min-w-[110px] shadow-xl z-20">
          <button onClick={() => { setOpen(false); onEdit() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06] transition-colors">
            <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.55)' }} /> 편집
          </button>
          <button onClick={() => { setOpen(false); onDelete() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
            <Image src="/Delete-2.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 삭제
          </button>
        </div>
      )}
    </div>
  )
}
