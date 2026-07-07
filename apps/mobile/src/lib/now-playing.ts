import { useSyncExternalStore } from 'react'
import type { Song } from '@mono/shared'

// 현재 재생 곡 스토어 — track-player 트랙엔 가사/좋아요 등 도메인 필드가 없어서
// playSong 시점의 전체 Song을 별도로 보관. 플레이어 화면이 이걸로 가사·좋아요를 그림.
let current: Song | null = null
const listeners = new Set<() => void>()

export function setNowPlaying(song: Song | null) {
  current = song
  listeners.forEach((l) => l())
}

export function getNowPlaying(): Song | null {
  return current
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useNowPlaying(): Song | null {
  return useSyncExternalStore(subscribe, getNowPlaying, getNowPlaying)
}
