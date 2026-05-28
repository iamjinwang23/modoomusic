// 좀비 generating row 회수: API 함수가 timeout·크래시·MiniMax 응답 누락 등으로 죽어
// status를 done/failed로 못 바꾼 곡을 일정 시간 후 failed로 강제 전환 + 크레딧 환불.
// Vercel Cron이 5분마다 호출. 보안: CRON_SECRET 검증.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundCredits } from '@/services/credit.service'
import { creditsForModel, MODELS, type MusicModelId } from '@/services/minimax.service'

// MiniMax 최대 100초 + Storage 업로드 여유 → 10분이면 사실상 죽은 거로 판단
const ZOMBIE_THRESHOLD_MS = 10 * 60 * 1000

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - ZOMBIE_THRESHOLD_MS).toISOString()
  const admin = createAdminClient()

  // 좀비 후보: status='generating' AND created_at < cutoff
  const { data: zombies, error: selErr } = await admin
    .from('songs')
    .select('id, user_id, instrumental, custom_lyrics')
    .eq('status', 'generating')
    .lt('created_at', cutoff)

  if (selErr) {
    console.error('[cron cleanup-generating] SELECT', selErr.message)
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  if (!zombies || zombies.length === 0) {
    return NextResponse.json({ ok: true, cleaned: 0, cutoff })
  }

  // 1차 출시: 모든 모델 동일 환불은 어렵지만 (모델 정보 row에 없음) 일단 모델별 cost 미보장.
  // 보수적으로 가장 비싼 모델(10cr) 환불 → 환불 부족보단 사용자 친화. 추후 songs.model 컬럼 추가 시 개선.
  const refundAmount = creditsForModel((MODELS[0].id) as MusicModelId)  // music-2.6 → 10cr

  // status → failed UPDATE
  const ids = zombies.map((z) => z.id)
  const { error: updErr } = await admin
    .from('songs')
    .update({ status: 'failed' })
    .in('id', ids)
  if (updErr) {
    console.error('[cron cleanup-generating] UPDATE', updErr.message)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // 각 사용자에게 환불 (병렬)
  const refundResults = await Promise.allSettled(
    zombies.map((z) => refundCredits(z.user_id, refundAmount)),
  )
  const refundFailed = refundResults.filter((r) => r.status === 'rejected').length

  return NextResponse.json({
    ok: true,
    cleaned: zombies.length,
    refundFailed,
    cutoff,
  })
}
