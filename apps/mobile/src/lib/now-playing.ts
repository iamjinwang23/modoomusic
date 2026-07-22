import { useSyncExternalStore } from 'react'

// 재생 대상 최소 구조 — 라이브러리 Song·탐색 PublicSong 모두 만족.
// track-player 트랙엔 가사/좋아요 등 도메인 필드가 없어서 별도 보관.
export interface NowPlaying {
  id: string
  title: string | null
  audioUrl: string
  coverImage?: string
  coverHue?: number      // 커버 지배색 hue — 미니플레이어 글라스 틴트 등에 사용
  duration?: number | null
  lyrics?: string | null
  liked?: boolean
  published?: boolean
  username?: string      // 공개곡(PublicSong)이면 크리에이터 핸들 — 플레이어에서 프로필 링크
  displayName?: string   // 크리에이터 표시명
  videoCoverUrl?: string          // 영상 커버 URL(있으면 플레이어가 영상 재생)
  videoCoverStatus?: 'generating' | 'done' | 'failed'
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
