// Design Ref: video-cover §4.1 — 비디오 커버 생성 요청 (비동기)
// 체험권/크레딧 차감 → MiniMax task 생성 → task_id 저장 후 즉시 응답.
// 완료는 GET /video-status (클라이언트 폴링) 또는 cleanup 크론이 마무리.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeVideoTrial, refundVideoTrial, tryConsumeCredits, refundCredits } from '@/services/credit.service'
import { createVideoTask, VIDEO_TIERS } from '@/services/video.service'
import type { VideoCoverMode, VideoCoverTier } from '@/types/domain'

interface Params { id: string }

export async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { id: songId } = await params
  if (!songId) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const uid = user.id

  let body: { mode?: unknown; tier?: unknown; motionPrompt?: unknown; textPrompt?: unknown; imageData?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }

  const mode: VideoCoverMode = body.mode === 'text_to_video' ? 'text_to_video' : 'image_to_video'
  const tier: VideoCoverTier = body.tier === 'hd' ? 'hd' : 'basic'
  const motionPrompt = typeof body.motionPrompt === 'string' ? body.motionPrompt.trim() : ''
  const textPrompt = typeof body.textPrompt === 'string' ? body.textPrompt.trim() : ''
  if (mode === 'text_to_video' && !textPrompt) return NextResponse.json({ error: 'prompt_required' }, { status: 400 })

  // 사용자가 교체한 이미지(data URL). MiniMax first_frame_image로만 사용 — DB 저장 X.
  const imageData = typeof body.imageData === 'string' && body.imageData.startsWith('data:image/') ? body.imageData : null
  // Vercel 요청 바디 한도(~4.5MB) 안쪽으로 가드. 클라가 1024px JPEG로 축소하므로 보통 1MB 미만.
  if (imageData && imageData.length > 4_000_000) return NextResponse.json({ error: 'image_too_large' }, { status: 413 })

  const admin = createAdminClient()
  const { data: song, error } = await admin
    .from('songs')
    .select('user_id, cover_image, publish_cover_image, video_cover_status')
    .eq('id', songId)
    .maybeSingle()
  if (error || !song) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (song.user_id !== uid) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (song.video_cover_status === 'generating') return NextResponse.json({ error: 'already_generating' }, { status: 409 })

  // image_to_video 소스: 교체 이미지 우선 → 발행 커버 → 원본 커버
  const imageUrl: string | null = (mode === 'image_to_video' && imageData)
    ? imageData
    : (song.publish_cover_image || song.cover_image || null)
  if (mode === 'image_to_video' && !imageUrl) return NextResponse.json({ error: 'no_cover_image' }, { status: 400 })

  // 결제: 체험권 우선 → 크레딧
  let charge: 'trial' | 'credit'
  if (await consumeVideoTrial(uid)) {
    charge = 'trial'
  } else {
    const { ok } = await tryConsumeCredits(uid, VIDEO_TIERS[tier].credits)
    if (!ok) return NextResponse.json({ error: 'insufficient', needCredits: VIDEO_TIERS[tier].credits }, { status: 402 })
    charge = 'credit'
  }

  // MiniMax 비동기 task 생성
  let taskId: string
  try {
    taskId = await createVideoTask({
      mode, tier,
      prompt: mode === 'text_to_video' ? textPrompt : (motionPrompt || undefined),
      imageUrl: imageUrl ?? undefined,
    })
  } catch (e) {
    if (charge === 'trial') await refundVideoTrial(uid)
    else await refundCredits(uid, VIDEO_TIERS[tier].credits)
    if ((e as { code?: string }).code === 'RATE_LIMITED') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    console.error('[generate-video] createTask:', e)
    return NextResponse.json({ error: 'minimax_failed', message: (e as Error).message }, { status: 502 })
  }

  await admin.from('songs').update({
    video_cover_status: 'generating',
    video_cover_mode: mode,
    video_cover_prompt: mode === 'text_to_video' ? textPrompt : (motionPrompt || null),
    video_cover_resolution: VIDEO_TIERS[tier].resolution,
    video_cover_task_id: taskId,
    video_cover_charge: charge,
    video_cover_started_at: new Date().toISOString(),
  }).eq('id', songId)

  return NextResponse.json({ status: 'generating', charge })
}
