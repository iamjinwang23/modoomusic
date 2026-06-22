// Design Ref: video-cover §4 — 비디오 커버 상태 폴링 + 완료 마무리 (소유자 전용)
// 클라이언트(모달)가 ~5초마다 호출. Success면 그 자리에서 다운로드·Storage 업로드·done.
// Fail/timeout이면 failed + 환불. (사용자 이탈 시엔 cleanup 크론이 동일 로직 수행)
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeVideoCover } from '@/services/video-finalize.service'

interface Params { id: string }

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { id: songId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const uid = user.id

  const admin = createAdminClient()
  const { data: song } = await admin
    .from('songs')
    .select('user_id, video_cover_status, video_cover_task_id, video_cover_url, video_cover_charge, video_cover_resolution, video_cover_started_at')
    .eq('id', songId)
    .maybeSingle()
  if (!song) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (song.user_id !== uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // 이미 종료 상태면 그대로 반환
  if (song.video_cover_status !== 'generating') {
    return NextResponse.json({ status: song.video_cover_status ?? null, videoCoverUrl: song.video_cover_url ?? null })
  }

  // 공통 헬퍼로 1회 점검·마무리 (cleanup 크론과 동일 로직)
  const result = await finalizeVideoCover({
    id: songId,
    user_id: song.user_id,
    video_cover_task_id: song.video_cover_task_id,
    video_cover_charge: song.video_cover_charge,
    video_cover_resolution: song.video_cover_resolution,
    video_cover_started_at: song.video_cover_started_at,
  })
  return NextResponse.json(result)
}
