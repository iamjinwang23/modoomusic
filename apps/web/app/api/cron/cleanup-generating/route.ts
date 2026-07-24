// 좀비 generating row 회수 헬퍼 + 수동 트리거용 endpoint.
// Vercel Hobby cron 한도(2개·daily) 때문에 자체 cron 미등록.
// cleanup-notifications cron이 nightly에 cleanupGeneratingZombies()를 같이 호출.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundCredits } from '@/services/credit.service'
import { creditsForModel, MODELS, type MusicModelId } from '@/services/minimax.service'

const ZOMBIE_THRESHOLD_MS = 10 * 60 * 1000  // MiniMax max 100s + Storage 여유 → 10분이면 사실상 죽음

export interface CleanupResult { cleaned: number; refundFailed: number; cutoff: string }

export async function cleanupGeneratingZombies(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - ZOMBIE_THRESHOLD_MS).toISOString()
  const admin = createAdminClient()

  const { data: zombies, error: selErr } = await admin
    .from('songs')
    .select('id, user_id')
    .eq('status', 'generating')
    .lt('created_at', cutoff)

  if (selErr) {
    console.error('[cleanup-generating] SELECT', selErr.message)
    throw new Error(selErr.message)
  }
  if (!zombies || zombies.length === 0) return { cleaned: 0, refundFailed: 0, cutoff }

  // songs에 model 컬럼이 없어 정확한 cost를 알 수 없음. 좀비는 빈도 낮으니 사용자 친화로 max 환불.
  const refundAmount = creditsForModel(MODELS[0].id as MusicModelId)  // MODELS[0]=music-3.0 → 10cr (최대 환불)

  const { error: updErr } = await admin
    .from('songs')
    .update({ status: 'failed', preview_audio_url: null })  // 미리 듣기 URL도 정리 (mig 065)
    .in('id', zombies.map((z) => z.id))
  if (updErr) {
    console.error('[cleanup-generating] UPDATE', updErr.message)
    throw new Error(updErr.message)
  }

  const refundResults = await Promise.allSettled(
    zombies.map((z) => refundCredits(z.user_id, refundAmount)),
  )
  const refundFailed = refundResults.filter((r) => r.status === 'rejected').length
  return { cleaned: zombies.length, refundFailed, cutoff }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await cleanupGeneratingZombies()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
