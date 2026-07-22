import { getVideoStatus } from './video'
import { getNowPlaying, setNowPlaying } from './now-playing'

// 앱 영상 폴러 — generating 영상의 완료를 서버 finalize로 수렴시킨다(웹 VideoCoverPoller 파리티).
// 앱엔 전역 곡 캐시가 없어, ① 생성 시작 ② 라이브러리 로드에서 songId를 등록(watch)하고,
// now-playing이 generating이면 자동 포함한다. video-status 호출이 서버 finalizeVideoCover를
// 트리거 → DB(video_cover_status) 갱신이 realtime(subscribeSongUpdates)으로 화면에 전파된다.
// (12분 초과 태스크는 서버가 failed+환불 처리.)
const watched = new Set<string>()
const inflight = new Set<string>()

export function watchVideoSong(songId: string | null | undefined): void {
  if (songId) watched.add(songId)
}

// 폴러 1틱 — 등록된 곡 + now-playing(generating)을 점검. done/failed면 watch 해제.
export async function pollVideoTick(): Promise<void> {
  const np = getNowPlaying()
  const ids = new Set(watched)
  if (np?.videoCoverStatus === 'generating' && np.id) ids.add(np.id)
  for (const id of ids) {
    if (inflight.has(id)) continue
    inflight.add(id)
    try {
      const d = await getVideoStatus(id)
      if (d.status === 'done' || d.status === 'failed') {
        watched.delete(id)
        // now-playing 곡이면 즉시 반영(플레이어가 영상 재생/실패 표시로 전환).
        const cur = getNowPlaying()
        if (cur?.id === id) {
          setNowPlaying({ ...cur, videoCoverStatus: d.status, videoCoverUrl: d.videoCoverUrl ?? cur.videoCoverUrl })
        }
      }
    } catch { /* 다음 틱에서 재시도 */ } finally {
      inflight.delete(id)
    }
  }
}
