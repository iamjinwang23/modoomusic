'use client'

import { createContext, useContext, useReducer, useRef, useState, useEffect, useCallback } from 'react'
import { songService } from '@/services/song.service'
import { track, EVENTS } from '@/utils/analytics'
import type { Song } from '@/types/domain'

interface State {
  feed: Song[]
  idx: number
  isOwner: boolean
  ownerUserId: string | null
  ownerAvatarUrl: string | null
  ownerAvatarHue: number | null
  ownerName: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
}

type Action =
  | { type: 'LOAD'; feed: Song[]; idx: number; isOwner: boolean; ownerUserId?: string | null; ownerAvatarUrl?: string | null; ownerAvatarHue?: number | null; ownerName?: string | null }
  | { type: 'PLAYING'; v: boolean }
  | { type: 'TIME'; t: number }
  | { type: 'DURATION'; d: number }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'PATCH'; patch: Partial<Song> }

const INIT: State = { feed: [], idx: 0, isOwner: false, ownerUserId: null, ownerAvatarUrl: null, ownerAvatarHue: null, ownerName: null, isPlaying: false, currentTime: 0, duration: 0 }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'LOAD':    return { ...s, feed: a.feed, idx: a.idx, isOwner: a.isOwner, ownerUserId: a.ownerUserId ?? null, ownerAvatarUrl: a.ownerAvatarUrl ?? null, ownerAvatarHue: a.ownerAvatarHue ?? null, ownerName: a.ownerName ?? null, currentTime: 0, duration: 0 }
    case 'PLAYING': return { ...s, isPlaying: a.v }
    case 'TIME':    return { ...s, currentTime: a.t }
    case 'DURATION':return { ...s, duration: a.d }
    case 'NEXT':    return s.idx < s.feed.length - 1 ? { ...s, idx: s.idx + 1, currentTime: 0 } : s
    case 'PREV':    return s.idx > 0 ? { ...s, idx: s.idx - 1, currentTime: 0 } : s
    case 'PATCH':   return { ...s, feed: s.feed.map((song, i) => i === s.idx ? { ...song, ...a.patch } : song) }
    default: return s
  }
}

interface PlayerCtx {
  song: Song | null
  feed: Song[]
  idx: number
  isOwner: boolean
  ownerAvatarUrl: string | null
  ownerAvatarHue: number | null
  ownerName: string | null
  ownerUserId: string | null
  hasPrev: boolean
  hasNext: boolean
  isPlaying: boolean
  currentTime: number
  duration: number
  togglePlay: () => void
  next: () => void
  prev: () => void
  seekTo: (t: number) => void
  patchSong: (patch: Partial<Song>) => void
  repeatOne: boolean              // 1곡 반복 재생 (HTMLAudioElement loop)
  toggleRepeatOne: () => void
}

const Ctx = createContext<PlayerCtx | null>(null)

export function GlobalPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INIT)
  const [repeatOne, setRepeatOne] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  // 같은 세션 안에서 같은 곡 중복 카운트 방지 (pause/resume 시 재증가 X)
  const countedRef = useRef<Set<string>>(new Set())

  const song = state.feed[state.idx] ?? null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!song) { audio.pause(); return }
    const loadedId = audio.getAttribute('data-song-id')
    if (loadedId === song.id) return
    audio.setAttribute('data-song-id', song.id)
    audio.src = song.audioUrl
    audio.play().catch(() => {})
  }, [song?.id])

  useEffect(() => {
    function handleViewSong(e: Event) {
      const { feed, idx, isOwner, ownerUserId, ownerAvatarUrl, ownerAvatarHue, ownerName, origin } = (e as CustomEvent).detail
      const newId = (feed as Song[])[idx]?.id
      const curId = stateRef.current.feed[stateRef.current.idx]?.id
      if (newId && newId === curId) return  // 상세 보기는 같은 곡이면 재로드 불필요
      // Plan SC FR-08: 새 곡 재생 시작 (view-song도 detail 진입 후 auto-play)
      if (newId) track(EVENTS.SONG_PLAY, { song_id: newId, origin: origin ?? 'unknown' })
      dispatch({ type: 'LOAD', feed, idx, isOwner, ownerUserId, ownerAvatarUrl, ownerAvatarHue, ownerName })
    }
    function handlePlaySong(e: Event) {
      const { feed, idx, isOwner, ownerUserId, ownerAvatarUrl, ownerAvatarHue, ownerName, origin } = (e as CustomEvent).detail
      const newId = (feed as Song[])[idx]?.id
      const curId = stateRef.current.feed[stateRef.current.idx]?.id
      if (newId && newId === curId) {
        // 같은 곡 → 재생 토글 (정지 상태면 재개, 재생 중이면 그대로 두기보다 일시정지)
        const a = audioRef.current
        if (a) a.paused ? a.play().catch(() => {}) : a.pause()
        return
      }
      // Plan SC FR-08: 새 곡 재생 시작 시 song_play (origin 옵셔널)
      if (newId) track(EVENTS.SONG_PLAY, { song_id: newId, origin: origin ?? 'unknown' })
      dispatch({ type: 'LOAD', feed, idx, isOwner, ownerUserId, ownerAvatarUrl, ownerAvatarHue, ownerName })
    }
    // 다른 곳(인라인 카드)에서 재생 시작 시 글로벌 오디오 정지
    function handleInlinePlay(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      if (detail !== '__global__') audioRef.current?.pause()
    }
    window.addEventListener('play-song', handlePlaySong)
    window.addEventListener('view-song', handleViewSong)
    window.addEventListener('audio-play', handleInlinePlay)
    return () => {
      window.removeEventListener('play-song', handlePlaySong)
      window.removeEventListener('view-song', handleViewSong)
      window.removeEventListener('audio-play', handleInlinePlay)
    }
  }, [])

  // When idx changes (NEXT/PREV), load the new song
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const newSong = stateRef.current.feed[stateRef.current.idx] ?? null
    if (!newSong) return
    const loadedId = audio.getAttribute('data-song-id')
    if (loadedId === newSong.id) return
    audio.setAttribute('data-song-id', newSong.id)
    audio.src = newSong.audioUrl
    audio.play().catch(() => {})
  }, [state.idx])

  // 모바일 잠금화면 / 제어센터 / Bluetooth / CarPlay 메타데이터 (Media Session API)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (!song) {
      ms.metadata = null
      return
    }
    let cancelled = false
    const coverUrl = song.publishCoverImage ?? song.coverImage ?? '/og_image.png'

    function applyMetadata(artworkSrc: string, type: string) {
      if (cancelled || !song) return
      ms.metadata = new MediaMetadata({
        title: song.title || song.prompt || '제목 없음',
        artist: state.ownerName ?? '모두의 노래',
        album: '모두의 노래',
        artwork: [{ src: artworkSrc, sizes: '512x512', type }],
      })
    }

    // iOS는 원본 비율(2:3) 그대로 노출 → canvas로 center-crop 후 정사각형 data URL로 주입
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')
      if (!ctx) return applyMetadata(coverUrl, 'image/png')
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 512, 512)
      try {
        applyMetadata(canvas.toDataURL('image/jpeg', 0.9), 'image/jpeg')
      } catch {
        // CORS taint 등 → 원본 URL 폴백
        applyMetadata(coverUrl, 'image/png')
      }
    }
    img.onerror = () => applyMetadata(coverUrl, 'image/png')
    img.src = coverUrl

    ms.setActionHandler('play',  () => audioRef.current?.play().catch(() => {}))
    ms.setActionHandler('pause', () => audioRef.current?.pause())
    ms.setActionHandler('previoustrack', stateRef.current.idx > 0 ? () => dispatch({ type: 'PREV' }) : null)
    ms.setActionHandler('nexttrack', stateRef.current.idx < stateRef.current.feed.length - 1 ? () => dispatch({ type: 'NEXT' }) : null)
    ms.setActionHandler('seekto', (e) => {
      if (typeof e.seekTime !== 'number') return
      if (audioRef.current) audioRef.current.currentTime = e.seekTime
    })

    return () => { cancelled = true }
  }, [song?.id, state.ownerName, state.idx, state.feed.length])

  // 잠금화면 시크바 위치 동기화
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (typeof navigator.mediaSession.setPositionState !== 'function') return
    if (!state.duration || !isFinite(state.duration)) return
    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        position: Math.min(state.currentTime, state.duration),
        playbackRate: 1,
      })
    } catch {
      // Safari가 position > duration일 때 throw — 무시
    }
  }, [state.currentTime, state.duration])

  // 재생 상태 sync (자동 감지되지만 명시)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused'
  }, [state.isPlaying])

  const togglePlay = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.paused ? a.play().catch(() => {}) : a.pause()
  }, [])

  const next = useCallback(() => dispatch({ type: 'NEXT' }), [])
  const prev = useCallback(() => dispatch({ type: 'PREV' }), [])
  const seekTo = useCallback((t: number) => { if (audioRef.current) audioRef.current.currentTime = t }, [])
  const patchSong = useCallback((patch: Partial<Song>) => dispatch({ type: 'PATCH', patch }), [])
  const toggleRepeatOne = useCallback(() => setRepeatOne((v) => !v), [])

  return (
    <Ctx.Provider value={{
      song, feed: state.feed, idx: state.idx, isOwner: state.isOwner, ownerUserId: state.ownerUserId, ownerAvatarUrl: state.ownerAvatarUrl, ownerAvatarHue: state.ownerAvatarHue, ownerName: state.ownerName,
      hasPrev: state.idx > 0, hasNext: state.idx < state.feed.length - 1,
      isPlaying: state.isPlaying, currentTime: state.currentTime, duration: state.duration,
      togglePlay, next, prev, seekTo, patchSong,
      repeatOne, toggleRepeatOne,
    }}>
      {children}
      <audio
        ref={audioRef}
        loop={repeatOne}
        onPlay={() => {
          dispatch({ type: 'PLAYING', v: true })
          // 인라인 카드들에게 정지 신호
          window.dispatchEvent(new CustomEvent('audio-play', { detail: '__global__' }))
          // 재생수 증가 — 세션 내 곡당 1회만
          const cur = stateRef.current.feed[stateRef.current.idx]
          if (cur && !countedRef.current.has(cur.id)) {
            countedRef.current.add(cur.id)
            fetch(`/api/songs/${cur.id}/play`, { method: 'POST' }).catch(() => {})
          }
        }}
        onPause={() => dispatch({ type: 'PLAYING', v: false })}
        onTimeUpdate={e => dispatch({ type: 'TIME', t: e.currentTarget.currentTime })}
        onLoadedMetadata={e => {
          const realDuration = e.currentTarget.duration
          dispatch({ type: 'DURATION', d: realDuration })
          const cur = stateRef.current.feed[stateRef.current.idx]
          if (cur && Math.round(realDuration) !== cur.duration) {
            songService.update(cur.id, { duration: Math.round(realDuration) })
            window.dispatchEvent(new Event('song-updated'))
          }
        }}
        onEnded={() => {
          const s = stateRef.current
          s.idx < s.feed.length - 1 ? dispatch({ type: 'NEXT' }) : dispatch({ type: 'PLAYING', v: false })
        }}
      />
    </Ctx.Provider>
  )
}

export function useGlobalPlayer() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGlobalPlayer requires GlobalPlayerProvider')
  return ctx
}
