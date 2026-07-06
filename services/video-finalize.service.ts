// Design Ref: video-cover §4 — 비디오 task 마무리 공통 로직 (서버 전용)
// video-status 라우트(클라 폴링) + cleanup 크론(이탈/서버재시작 회수)이 공유.
import { createAdminClient } from '@/lib/supabase/admin'
import { queryVideoTask, retrieveFileUrl, VIDEO_TIERS } from '@/services/video.service'
import { uploadFromUrl } from '@/services/storage.service'
import { refundVideoTrial, refundCredits } from '@/services/credit.service'
import { sendPushToUser } from '@/services/push.service'

const TIMEOUT_MS = 12 * 60 * 1000

export interface VideoSongRow {
  id: string
  user_id: string
  video_cover_task_id: string | null
  video_cover_charge: string | null
  video_cover_resolution: string | null
  video_cover_started_at: string | null
}

export interface FinalizeResult {
  status: 'done' | 'failed' | 'generating'
  videoCoverUrl?: string
}

// 단일 곡의 진행중 비디오 task를 1회 점검·마무리. (idempotent — 동시 호출 시 먼저 끝낸 쪽이 이김)
export async function finalizeVideoCover(song: VideoSongRow): Promise<FinalizeResult> {
  const admin = createAdminClient()
  const tier = song.video_cover_resolution === '768P' ? 'hd' : 'basic'
  const refund = async () => {
    if (song.video_cover_charge === 'trial') await refundVideoTrial(song.user_id)
    else if (song.video_cover_charge === 'credit') await refundCredits(song.user_id, VIDEO_TIERS[tier].credits)
  }
  const markFailed = async () => {
    await refund()
    await admin.from('songs').update({ video_cover_status: 'failed' }).eq('id', song.id)
    // 실패 알림 (크레딧/체험권 환불 안내)
    await admin.from('notifications').insert({ user_id: song.user_id, type: 'song_complete', song_id: song.id, payload: { kind: 'video_cover_failed' } })
  }

  const isTimedOut = !!song.video_cover_started_at && Date.now() - new Date(song.video_cover_started_at).getTime() > TIMEOUT_MS

  // task id 없으면: timeout이면 실패, 아니면 대기
  if (!song.video_cover_task_id) {
    if (isTimedOut) { await markFailed(); return { status: 'failed' } }
    return { status: 'generating' }
  }

  try {
    // 쿼리를 먼저 — 완성됐다면 시간이 지났어도 반드시 저장 (timeout보다 우선)
    const { status, fileId } = await queryVideoTask(song.video_cover_task_id)
    if (status === 'Success' && fileId) {
      const dl = await retrieveFileUrl(fileId)
      if (!dl) { await markFailed(); return { status: 'failed' } }
      const publicUrl = await uploadFromUrl(dl, 'songs-video-covers', `${song.user_id}/${song.id}.mp4`)
      if (!publicUrl) { await markFailed(); return { status: 'failed' } }
      // 재생성 시 같은 경로 + immutable 캐시라 옛 영상이 그대로 노출됨 → 버전 쿼리로 캐시버스트
      const bustedUrl = `${publicUrl}?v=${Date.now()}`
      await admin.from('songs').update({
        video_cover_status: 'done',
        video_cover_url: bustedUrl,
        video_cover_generated_at: new Date().toISOString(),
      }).eq('id', song.id)
      await admin.from('notifications').insert({ user_id: song.user_id, type: 'song_complete', song_id: song.id, payload: { kind: 'video_cover' } })
      await sendPushToUser(song.user_id, { title: '영상 커버 완성', body: '영상 커버 생성이 완료됐어요', url: '/library', tag: `videocover-${song.id}` })
      return { status: 'done', videoCoverUrl: bustedUrl }
    }
    if (status === 'Fail') { await markFailed(); return { status: 'failed' } }
    // 아직 처리중 — timeout 넘었으면 실패 처리, 아니면 대기
    if (isTimedOut) { await markFailed(); return { status: 'failed' } }
    return { status: 'generating' }
  } catch (e) {
    console.error('[finalizeVideoCover] query:', (e as Error).message)
    // 쿼리 자체가 계속 실패하고 timeout도 넘었으면 실패 처리
    if (isTimedOut) { await markFailed(); return { status: 'failed' } }
    return { status: 'generating' }
  }
}

// 진행중(generating) 비디오 전체를 sweep — cleanup 크론에서 호출 (이탈·서버재시작 회수)
export async function sweepVideoCovers(): Promise<{ checked: number; done: number; failed: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('songs')
    .select('id, user_id, video_cover_task_id, video_cover_charge, video_cover_resolution, video_cover_started_at')
    .eq('video_cover_status', 'generating')
    .limit(200)
  if (error || !data) return { checked: 0, done: 0, failed: 0 }
  let done = 0, failed = 0
  for (const s of data) {
    const r = await finalizeVideoCover(s as VideoSongRow)
    if (r.status === 'done') done++
    else if (r.status === 'failed') failed++
  }
  return { checked: data.length, done, failed }
}
