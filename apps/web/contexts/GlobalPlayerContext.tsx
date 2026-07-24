'use client'

import { createContext, useContext, useReducer, useRef, useState, useEffect, useCallback } from 'react'
import { songService } from '@/services/song.service'
import { track, EVENTS } from '@/utils/analytics'
import { useAuth } from '@/components/AuthProvider'
import type { Song } from '@mono/shared'

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

// 곡 전환(NEXT/PREV) 시 새 곡의 크리에이터로 owner 메타 갱신. 공개곡(PublicSong)은 크리에이터 필드 보유 →
// 그걸로 갱신. 내 곡 피드처럼 필드가 없으면 기존 owner 유지(모두 내 곡이라 owner 불변).
function ownerFromSong(song: Song | undefined, s: State): Pick<State, 'ownerUserId' | 'ownerName' | 'ownerAvatarUrl' | 'ownerAvatarHue'> {
  const u = song as Partial<{ userId: string; username: string; displayName: string; avatarUrl: string | null; avatarHue: number | null }> | undefined
  if (u && (u.userId || u.username || u.displayName)) {
    return { ownerUserId: u.userId ?? null, ownerName: u.displayName ?? u.username ?? null, ownerAvatarUrl: u.avatarUrl ?? null, ownerAvatarHue: u.avatarHue ?? null }
  }
  return { ownerUserId: s.ownerUserId, ownerName: s.ownerName, ownerAvatarUrl: s.ownerAvatarUrl, ownerAvatarHue: s.ownerAvatarHue }
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'LOAD':    return { ...s, feed: a.feed, idx: a.idx, isOwner: a.isOwner, ownerUserId: a.ownerUserId ?? null, ownerAvatarUrl: a.ownerAvatarUrl ?? null, ownerAvatarHue: a.ownerAvatarHue ?? null, ownerName: a.ownerName ?? null, currentTime: 0, duration: 0 }
    case 'PLAYING': return { ...s, isPlaying: a.v }
    case 'TIME':    return { ...s, currentTime: a.t }
    case 'DURATION':return { ...s, duration: a.d }
    case 'NEXT':    return s.idx < s.feed.length - 1 ? { ...s, idx: s.idx + 1, currentTime: 0, ...ownerFromSong(s.feed[s.idx + 1], s) } : s
    case 'PREV':    return s.idx > 0 ? { ...s, idx: s.idx - 1, currentTime: 0, ...ownerFromSong(s.feed[s.idx - 1], s) } : s
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
  const { user } = useAuth()
  // 생성 중 미리 듣기 — 현재 로드된 프리뷰 URL(null=일반 재생). 프리뷰 끝에서 최신 부분/완곡으로 체이스.
  const previewRef = useRef<string | null>(null)
  const chaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const song = state.feed[state.idx] ?? null
  // isOwner는 현재 ownerUserId(곡 전환 시 갱신됨) 기준으로 매번 재계산 → 곡 넘겨도 정확
  const isOwner = !!user && !!state.ownerUserId && state.ownerUserId === user.id

  // 곡을 audio에 로드 — 완곡 없고 생성 중이면 프리뷰 URL 사용
  const loadIntoAudio = useCallback((audio: HTMLAudioElement, s: Song) => {
    if (chaseTimerRef.current) { clearTimeout(chaseTimerRef.current); chaseTimerRef.current = null }
    const usePreview = !s.audioUrl && s.status === 'generating' && !!s.previewAudioUrl
    previewRef.current = usePreview ? (s.previewAudioUrl as string) : null
    audio.src = usePreview ? (s.previewAudioUrl as string) : s.audioUrl
    audio.play().catch(() => {})
  }, [])

  // 프리뷰 끝 도달 시 — 캐시 최신값으로 다음 소스 결정(더 긴 프리뷰/완곡). 새 부분이 아직 없으면 3초 후 재시도.
  const chasePreview = useCallback((): boolean => {
    const a = audioRef.current
    if (!a || !previewRef.current) return false
    const cur = stateRef.current.feed[stateRef.current.idx]
    if (!cur) return false
    const fresh = songService.getById(cur.id)
    if (!fresh) return false
    const resumeAt = a.currentTime

    const swapTo = (url: string) => {
      a.src = url
      a.addEventListener('loadedmetadata', () => {
        a.currentTime = Math.min(resumeAt, Math.max(0, a.duration - 0.05))
        a.play().catch(() => {})
      }, { once: true })
    }

    if (fresh.status === 'done' && fresh.audioUrl) {
      previewRef.current = null
      dispatch({ type: 'PATCH', patch: {
        audioUrl: fresh.audioUrl, status: 'done',
        duration: fresh.duration ?? cur.duration,
        title: fresh.title ?? cur.title,
        coverImage: fresh.coverImage ?? cur.coverImage,
        lyrics: fresh.lyrics ?? cur.lyrics,
        prompt: fresh.prompt ?? cur.prompt,
      } })
      swapTo(fresh.audioUrl)
      return true
    }
    if (fresh.status === 'generating' && fresh.previewAudioUrl && fresh.previewAudioUrl !== previewRef.current) {
      previewRef.current = fresh.previewAudioUrl
      swapTo(fresh.previewAudioUrl)
      return true
    }
    if (fresh.status === 'generating') {
      // 다음 부분이 아직 안 옴 — 잠시 후 재시도(생성 페이스가 재생을 못 따라온 경우)
      chaseTimerRef.current = setTimeout(() => { chasePreview() }, 3000)
      return true
    }
    previewRef.current = null  // failed 등 — 일반 흐름으로
    return false
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (!song) { audio.pause(); return }
    const loadedId = audio.getAttribute('data-song-id')
    if (loadedId === song.id) return
    audio.setAttribute('data-song-id', song.id)
    loadIntoAudio(audio, song)
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
    // 곡 정보 수정(제목·커버·가사·코멘트·게시) 시 현재 상세/재생 곡을 캐시에서 즉시 재동기화
    // → 새로고침 없이 곡 상세·미니바에 바로 반영
    function handleSongUpdated() {
      const cur = stateRef.current.feed[stateRef.current.idx]
      if (!cur) return
      const fresh = songService.getById(cur.id)
      if (!fresh) return
      // 캐시값이 null/undefined면 현재 값 유지 — 캐시본이 덜 완전해도(예: lyrics null)
      // 피드의 정상 데이터를 덮어쓰지 않게. (탐색에서 연 곡은 피드에 가사 있는데 캐시엔 없을 수 있음)
      dispatch({ type: 'PATCH', patch: {
        title: fresh.title ?? cur.title,
        coverImage: fresh.coverImage ?? cur.coverImage,
        coverHue: fresh.coverHue ?? cur.coverHue,
        lyrics: fresh.lyrics ?? cur.lyrics,
        publishComment: fresh.publishComment ?? cur.publishComment,
        published: fresh.published ?? cur.published,
        publishedAt: fresh.publishedAt ?? cur.publishedAt,
      } })
    }
    window.addEventListener('play-song', handlePlaySong)
    window.addEventListener('view-song', handleViewSong)
    window.addEventListener('audio-play', handleInlinePlay)
    window.addEventListener('song-updated', handleSongUpdated)
    return () => {
      window.removeEventListener('play-song', handlePlaySong)
      window.removeEventListener('view-song', handleViewSong)
      window.removeEventListener('audio-play', handleInlinePlay)
      window.removeEventListener('song-updated', handleSongUpdated)
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
    loadIntoAudio(audio, newSong)
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

  // 체이스 타이머 언마운트 정리
  useEffect(() => () => { if (chaseTimerRef.current) clearTimeout(chaseTimerRef.current) }, [])

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
      song, feed: state.feed, idx: state.idx, isOwner, ownerUserId: state.ownerUserId, ownerAvatarUrl: state.ownerAvatarUrl, ownerAvatarHue: state.ownerAvatarHue, ownerName: state.ownerName,
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
          // 재생수 증가 — 세션 내 곡당 1회만 (프리뷰는 미완성 재생이라 제외)
          const cur = stateRef.current.feed[stateRef.current.idx]
          if (cur && !previewRef.current && !countedRef.current.has(cur.id)) {
            countedRef.current.add(cur.id)
            fetch(`/api/songs/${cur.id}/play`, { method: 'POST' }).catch(() => {})
          }
        }}
        onPause={() => dispatch({ type: 'PLAYING', v: false })}
        onTimeUpdate={e => dispatch({ type: 'TIME', t: e.currentTarget.currentTime })}
        onLoadedMetadata={e => {
          const realDuration = e.currentTarget.duration
          dispatch({ type: 'DURATION', d: realDuration })
          // 프리뷰(부분 파일)는 실제 곡 길이가 아니므로 duration 저장 스킵
          if (previewRef.current) return
          const cur = stateRef.current.feed[stateRef.current.idx]
          if (cur && Math.round(realDuration) !== cur.duration) {
            songService.update(cur.id, { duration: Math.round(realDuration) })
            window.dispatchEvent(new Event('song-updated'))
          }
        }}
        onEnded={() => {
          // 프리뷰 끝 — 최신 부분/완곡으로 이어서(체이스). 처리됐으면 일반 종료 로직 스킵
          if (chasePreview()) return
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
