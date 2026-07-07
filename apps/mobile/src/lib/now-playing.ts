import { useSyncExternalStore } from 'react'

// 재생 대상 최소 구조 — 라이브러리 Song·탐색 PublicSong 모두 만족.
// track-player 트랙엔 가사/좋아요 등 도메인 필드가 없어서 별도 보관.
export interface NowPlaying {
  id: string
  title: string | null
  audioUrl: string
  coverImage?: string
  duration?: number | null
  lyrics?: string | null
  liked?: boolean
  published?: boolean
}

let current: NowPlaying | null = null
const listeners = new Set<() => void>()

export function setNowPlaying(song: NowPlaying | null) {
  current = song
  listeners.forEach((l) => l())
}

export function getNowPlaying(): NowPlaying | null {
  return current
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useNowPlaying(): NowPlaying | null {
  return useSyncExternalStore(subscribe, getNowPlaying, getNowPlaying)
}
