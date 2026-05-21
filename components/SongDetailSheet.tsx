'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import type { Song } from '@/types/domain'

interface Props {
  song: Song
  onClose: () => void
  onDelete?: () => void
  onPrev?: () => void
  onNext?: () => void
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

export function SongDetailSheet({ song, onClose, onDelete, onPrev, onNext }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [visible, setVisible] = useState(false)
  const [songData, setSongData] = useState(song)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pendingPlayRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

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

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

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
    songService.update(song.id, { liked: next })
    setSongData((prev) => ({ ...prev, liked: next }))
  }

  async function handleShare() {
    const title = songData.title || songData.prompt.slice(0, 40)
    if (navigator.share) {
      await navigator.share({ title, url: song.audioUrl }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(song.audioUrl).catch(() => {})
    }
  }

  function handleDelete() {
    songService.delete(song.id)
    onDelete?.()
    handleClose()
  }

  function handleConfirmDelete() {
    setConfirmDelete(false)
    handleDelete()
  }

  function handleEditClose() {
    setEditOpen(false)
    const updated = songService.getById(song.id)
    if (updated) setSongData(updated)
  }

  function handlePrev() {
    pendingPlayRef.current = true
    onPrev?.()
  }

  function handleNext() {
    pendingPlayRef.current = true
    onNext?.()
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const displayTitle = songData.title || 'Untitled'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-[720px] bg-[#21252E] rounded-3xl overflow-hidden flex flex-col transition-all duration-300 ease-out`}
        style={{
          maxHeight: '82vh',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.97)',
        }}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>

        {/* ── Main content ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left — Cover + meta */}
          <div className="w-[240px] shrink-0 flex flex-col p-5 gap-4">
            {/* Cover art */}
            <div
              className="w-full rounded-2xl flex-1 min-h-[200px] max-h-[280px]"
              style={{ background: coverGradient(songData) }}
            />

            {/* Date */}
            <p className="text-xs text-zinc-500">{relativeTime(song.createdAt)}</p>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <ActionBtn title="좋아요" icon="/Thumb-Up.svg" active={songData.liked} onClick={handleLike} />
              <ActionBtn title="공유" icon="/Share.svg" onClick={handleShare} />
              <ActionBtn title="저장" icon="/Arrow-To-Down.svg" />
              <DetailMoreMenu
                onEdit={() => setEditOpen(true)}
                onDelete={() => setConfirmDelete(true)}
              />
            </div>
          </div>

          {/* Right — Title + Lyrics (scrollable) */}
          <div className="flex-1 overflow-y-auto py-5 pr-6 pl-1">
            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-3 leading-snug pr-8">{displayTitle}</h2>

            {/* Prompt */}
            <p className="text-sm text-zinc-400 leading-relaxed mb-5">{songData.prompt}</p>

            {/* Tags */}
            {(songData.mood || songData.instrumental) && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {songData.mood && (
                  <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-white/[0.06]">
                    {songData.mood}
                  </span>
                )}
                {songData.instrumental && (
                  <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-white/[0.06]">
                    Instrumental
                  </span>
                )}
              </div>
            )}

            {/* Lyrics */}
            {songData.lyrics && (
              <pre className="text-sm text-zinc-300 whitespace-pre-wrap leading-[1.9]">
                {songData.lyrics}
              </pre>
            )}
          </div>
        </div>

        {/* ── Player ── */}
        <div className="shrink-0 border-t border-white/[0.06] bg-[#1C1F27] px-6 pt-4 pb-5">
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

          {/* Controls */}
          <div className="flex items-center justify-center gap-6 mb-3">
            <button
              onClick={handlePrev}
              disabled={!onPrev}
              className={`transition-opacity ${onPrev ? 'hover:opacity-70' : 'opacity-25 cursor-default'}`}
            >
              <Image src="/Skip-Previous.svg" alt="이전 곡" width={24} height={24} style={{ filter: 'invert(0.55)' }} />
            </button>

            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-white hover:bg-zinc-100 flex items-center justify-center transition-colors"
            >
              <Image
                src={playing ? '/Pause.svg' : '/Play.svg'}
                alt={playing ? '일시정지' : '재생'}
                width={26}
                height={26}
              />
            </button>

            <button
              onClick={handleNext}
              disabled={!onNext}
              className={`transition-opacity ${onNext ? 'hover:opacity-70' : 'opacity-25 cursor-default'}`}
            >
              <Image src="/Skip-Forward.svg" alt="다음 곡" width={24} height={24} style={{ filter: 'invert(0.55)' }} />
            </button>
          </div>

          {/* Seekbar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 w-8 text-right tabular-nums">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-0.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(to right, #fff ${progress}%, #3f3f46 ${progress}%)`,
              }}
            />
            <span className="text-xs text-zinc-500 w-8 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {editOpen && (
        <SongEditModal song={songData} onClose={handleEditClose} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
            <p className="text-sm font-semibold text-white mb-1">삭제하시겠어요?</p>
            <p className="text-xs text-zinc-400 mb-5 truncate">"{displayTitle}"</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                아니요
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                네
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailMoreMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
      >
        <Image src="/More.svg" alt="더보기" width={18} height={18} style={{ filter: 'invert(0.55)' }} />
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 bg-[#282D38] border border-white/[0.08] rounded-xl py-1 min-w-[110px] shadow-xl z-20">
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
          >
            <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.55)' }} />
            편집
          </button>
          <button
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Image src="/Delete-2.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} />
            삭제
          </button>
        </div>
      )}
    </div>
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
      <Image
        src={icon}
        alt={title}
        width={18}
        height={18}
        style={{ filter: active ? 'invert(0)' : 'invert(0.55)' }}
      />
    </button>
  )
}
