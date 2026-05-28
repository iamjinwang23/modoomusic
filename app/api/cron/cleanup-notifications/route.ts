// 90일 이상 된 알림 일괄 삭제 + 좀비 generating 곡 회수. Vercel Cron이 nightly 호출.
// Hobby cron 한도(2개·daily) 안에 묶기 위해 두 cleanup 작업을 한 cron에 통합.
// 보안: CRON_SECRET 헤더 검증.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanupGeneratingZombies } from '../cleanup-generating/route'

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

  // 좀비 generating 곡도 같이 회수 (실패해도 알림 정리 결과는 반환)
  let zombies: { cleaned: number; refundFailed: number } | { error: string }
  try {
    const r = await cleanupGeneratingZombies()
    zombies = { cleaned: r.cleaned, refundFailed: r.refundFailed }
  } catch (e) {
    zombies = { error: e instanceof Error ? e.message : 'unknown' }
  }

  if (error) {
    console.error('[cron cleanup-notifications]', error.message)
    return NextResponse.json({ error: error.message, zombies }, { status: 500 })
  }
  return NextResponse.json({ ok: true, deletedNotifications: count ?? 0, cutoff, zombies })
}
