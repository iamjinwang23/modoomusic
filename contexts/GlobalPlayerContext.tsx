'use client'

import { createContext, useContext, useReducer, useRef, useEffect, useCallback } from 'react'
import { songService } from '@/services/song.service'
import type { Song } from '@/types/domain'

interface State {
  feed: Song[]
  idx: number
  isOwner: boolean
  ownerAvatarUrl: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
}

type Action =
  | { type: 'LOAD'; feed: Song[]; idx: number; isOwner: boolean; ownerAvatarUrl?: string | null }
  | { type: 'PLAYING'; v: boolean }
  | { type: 'TIME'; t: number }
  | { type: 'DURATION'; d: number }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'PATCH'; patch: Partial<Song> }

const INIT: State = { feed: [], idx: 0, isOwner: false, ownerAvatarUrl: null, isPlaying: false, currentTime: 0, duration: 0 }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'LOAD':    return { ...s, feed: a.feed, idx: a.idx, isOwner: a.isOwner, ownerAvatarUrl: a.ownerAvatarUrl ?? null, currentTime: 0, duration: 0 }
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
}

const Ctx = createContext<PlayerCtx | null>(null)

export function GlobalPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INIT)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

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
    function handler(e: Event) {
      const { feed, idx, isOwner, ownerAvatarUrl } = (e as CustomEvent).detail
      const newId = (feed as Song[])[idx]?.id
      const curId = stateRef.current.feed[stateRef.current.idx]?.id
      if (newId && newId === curId) return
      dispatch({ type: 'LOAD', feed, idx, isOwner, ownerAvatarUrl })
    }
    window.addEventListener('play-song', handler)
    window.addEventListener('view-song', handler)
    return () => {
      window.removeEventListener('play-song', handler)
      window.removeEventListener('view-song', handler)
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

  const togglePlay = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.paused ? a.play().catch(() => {}) : a.pause()
  }, [])

  const next = useCallback(() => dispatch({ type: 'NEXT' }), [])
  const prev = useCallback(() => dispatch({ type: 'PREV' }), [])
  const seekTo = useCallback((t: number) => { if (audioRef.current) audioRef.current.currentTime = t }, [])
  const patchSong = useCallback((patch: Partial<Song>) => dispatch({ type: 'PATCH', patch }), [])

  return (
    <Ctx.Provider value={{
      song, feed: state.feed, idx: state.idx, isOwner: state.isOwner, ownerAvatarUrl: state.ownerAvatarUrl,
      hasPrev: state.idx > 0, hasNext: state.idx < state.feed.length - 1,
      isPlaying: state.isPlaying, currentTime: state.currentTime, duration: state.duration,
      togglePlay, next, prev, seekTo, patchSong,
    }}>
      {children}
      <audio
        ref={audioRef}
        onPlay={() => dispatch({ type: 'PLAYING', v: true })}
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
