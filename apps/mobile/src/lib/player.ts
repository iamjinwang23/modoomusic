import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event } from 'react-native-track-player'
import { setNowPlaying, type NowPlaying } from './now-playing'
import { myDisplayName } from './me'
import { api } from './api'

let ready = false
// 현재 큐의 곡별 도메인 데이터(가사·좋아요 등) — 활성 트랙 변경 시 now-playing 복원용
const queueMap = new Map<string, NowPlaying>()

// 재생수 — 세션 내 곡당 1회만(웹 GlobalPlayerContext.countedRef 파리티). 서버 RPC는 dedup 없어 클라가 게이트.
const countedPlays = new Set<string>()
function countPlay(id: string) {
  if (countedPlays.has(id)) return
  countedPlays.add(id)
  api.post(`/api/songs/${id}/play`).catch(() => {}) // fire-and-forget
}

function toTrack(s: NowPlaying, myName: string | null) {
  return {
    id: s.id,
    url: s.audioUrl,
    title: s.title?.trim() || '제목 없음',
    // 공개곡=크리에이터 표시명 / 내 곡=내 표시명(폴백 '내 음악')
    artist: s.displayName?.trim() || myName || '내 음악',
    artwork: s.coverImage,
    duration: s.duration ?? undefined,
  }
}

export async function setupPlayer() {
  if (ready) return
  try {
    await TrackPlayer.setupPlayer()
  } catch {
    // 이미 초기화된 경우 무시
  }
  await TrackPlayer.updateOptions({
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
    capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
  })
  // 이전/다음 곡 이동(락스크린·앱 내 버튼)으로 활성 트랙이 바뀌면 now-playing 화면 동기화 + 재생수 집계.
  // ActiveTrackChanged는 초기 재생·스킵 모두 발화 → 여기서 세션당 곡1회 카운트.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (e) => {
    const id = (e?.track as { id?: string } | undefined)?.id
    if (id && queueMap.has(id)) {
      setNowPlaying(queueMap.get(id)!)
      countPlay(id)
    }
  })
  ready = true
}

// 곡 재생 — queue를 주면 목록 전체를 큐에 넣고 해당 곡부터 재생(이전/다음 곡 동작).
// queue 없으면 단일 곡.
export async function playSong(song: NowPlaying, queue?: NowPlaying[]) {
  if (!song.audioUrl) return
  const list = (queue && queue.length ? queue : [song]).filter((s) => s.audioUrl)
  const startIdx = Math.max(0, list.findIndex((s) => s.id === song.id))
  setNowPlaying(song)
  await setupPlayer()
  const myName = await myDisplayName()
  queueMap.clear()
  list.forEach((s) => queueMap.set(s.id, s))
  await TrackPlayer.reset()
  await TrackPlayer.add(list.map((s) => toTrack(s, myName)))
  if (startIdx > 0) await TrackPlayer.skip(startIdx)
  await TrackPlayer.play()
}
