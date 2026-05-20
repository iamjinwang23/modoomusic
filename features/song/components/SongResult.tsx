'use client'

import { useRef, useEffect, useState } from 'react'
import type { Song } from '@/types/domain'

interface Props {
  song: Song
  elapsed: number
  onReset: () => void
}

function formatTime(s: number) {
  if (!s || isNaN(s) || !isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function SongResult({ song, elapsed, onReset }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [copyDone, setCopyDone] = useState(false)

  useEffect(() => {
    audioRef.current?.play().then(() => setPlaying(true)).catch(() => {})
  }, [song.id])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play(); setPlaying(true) }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    const t = Number(e.target.value)
    audio.currentTime = t
    setCurrentTime(t)
  }

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: song.title ?? '오늘의 노래', url: window.location.href })
      } else {
        await navigator.clipboard.writeText(window.location.href)
      }
    } catch {
      try { await navigator.clipboard.writeText(window.location.href) } catch {}
    }
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 2000)
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg>
        다시 만들기
      </button>

      {/* Title + meta */}
      <div>
        <h2 className="text-xl font-bold text-white leading-snug">
          {song.title || '제목 없음'}
        </h2>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-zinc-600">{elapsed}초 생성</span>
          {song.genre && (
            <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-white/[0.06]">
              {song.genre}
            </span>
          )}
          {song.mood && (
            <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-white/[0.06]">
              {song.mood}
            </span>
          )}
          {song.instrumental && (
            <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-white/[0.06]">
              Instrumental
            </span>
          )}
        </div>
      </div>

      {/* Audio player */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/[0.06] p-5">
        <audio
          ref={audioRef}
          src={song.audioUrl}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onEnded={() => setPlaying(false)}
        />

        <div className="flex items-center gap-4">
          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            className="shrink-0 w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-colors"
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M8 5.14v13.72L19 12 8 5.14z"/>
              </svg>
            )}
          </button>

          {/* Progress */}
          <div className="flex-1 space-y-1.5">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400"
              style={{
                background: `linear-gradient(to right, #8b5cf6 ${progress}%, #3f3f46 ${progress}%)`,
              }}
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lyrics */}
      {song.lyrics && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() => setLyricsOpen(!lyricsOpen)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm hover:bg-white/[0.02] transition-colors"
          >
            <span className="font-medium text-zinc-200">가사</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-zinc-500 transition-transform duration-200 ${lyricsOpen ? 'rotate-180' : ''}`}
            >
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          <div
            className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
            style={{ maxHeight: lyricsOpen ? 600 : 0 }}
          >
            <pre className="px-5 pb-5 text-sm text-zinc-400 whitespace-pre-wrap leading-loose">
              {song.lyrics}
            </pre>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08] hover:border-white/20 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          {copyDone ? '링크 복사됨' : '공유'}
        </button>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.06] text-sm text-zinc-600">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          저장됨
        </div>
      </div>
    </div>
  )
}
