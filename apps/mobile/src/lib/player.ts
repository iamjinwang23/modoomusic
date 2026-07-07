import TrackPlayer, { AppKilledPlaybackBehavior, Capability } from 'react-native-track-player'
import { setNowPlaying, type NowPlaying } from './now-playing'

let ready = false

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
  ready = true
}

// 단일 곡 재생 — 큐 리셋 후 추가·재생. audioUrl 없으면 무시.
export async function playSong(song: NowPlaying) {
  if (!song.audioUrl) return
  setNowPlaying(song)
  await setupPlayer()
  await TrackPlayer.reset()
  await TrackPlayer.add({
    id: song.id,
    url: song.audioUrl,
    title: song.title?.trim() || '제목 없음',
    artist: '내 음악',
    artwork: song.coverImage,
    duration: song.duration ?? undefined,
  })
  await TrackPlayer.play()
}
