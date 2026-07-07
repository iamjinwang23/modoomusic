import TrackPlayer, { Event } from 'react-native-track-player'

// 잠금화면/제어센터 리모트 이벤트 핸들러 (registerPlaybackService로 등록)
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play())
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause())
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext().catch(() => {}))
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious().catch(() => {}))
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.reset())
}
