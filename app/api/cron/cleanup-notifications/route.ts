// 90일 이상 된 알림 일괄 삭제. Vercel Cron이 nightly 호출.
// 모든 타입(like, song_complete, system, follow, comment) 일괄 처리.
// 보안: CRON_SECRET 헤더 검증 (Vercel Cron이 자동 전달)
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  // Vercel Cron의 Authorization: Bearer <CRON_SECRET> 검증
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

  if (error) {
    console.error('[cron cleanup-notifications]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, deleted: count ?? 0, cutoff })
}
