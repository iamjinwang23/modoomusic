// 90일 이상 된 알림 일괄 삭제 + 좀비 generating 곡 회수 + 7일+ 회원 탈퇴 영구 파기.
// Vercel Hobby cron 한도(2개·daily) 안에 묶기 위해 세 cleanup 작업을 한 cron에 통합.
// 보안: CRON_SECRET 헤더 검증.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanupGeneratingZombies } from '../cleanup-generating/route'
import { finalizeDeletions } from '@/services/account.service'
import { sweepVideoCovers } from '@/services/video-finalize.service'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const admin = createAdminClient()

  const { error, count } = await admin
    .from('notifications')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  // 좀비 generating 곡 회수
  let zombies: { cleaned: number; refundFailed: number } | { error: string }
  try {
    const r = await cleanupGeneratingZombies()
    zombies = { cleaned: r.cleaned, refundFailed: r.refundFailed }
  } catch (e) {
    zombies = { error: e instanceof Error ? e.message : 'unknown' }
  }

  // Design Ref: account-deletion §7.2 — 7일+ 회원 탈퇴 영구 파기 (운영정책 §7 적용)
  let deletions: { finalized: number; errors: number } | { error: string }
  try {
    deletions = await finalizeDeletions()
  } catch (e) {
    deletions = { error: e instanceof Error ? e.message : 'unknown' }
  }

  // video-cover §4 — 진행중 비디오 task 회수 (이탈/서버재시작으로 폴링 끊긴 건 마무리)
  let videos: { checked: number; done: number; failed: number } | { error: string }
  try {
    videos = await sweepVideoCovers()
  } catch (e) {
    videos = { error: e instanceof Error ? e.message : 'unknown' }
  }

  if (error) {
    console.error('[cron cleanup-notifications]', error.message)
    return NextResponse.json({ error: error.message, zombies, deletions, videos }, { status: 500 })
  }
  return NextResponse.json({ ok: true, deletedNotifications: count ?? 0, cutoff, zombies, deletions, videos })
}
