// POST /api/admin/backfill-durations — duration이 비어있는 기존 곡을 파일 크기로 추정해 채움(일회성 유지보수).
// MiniMax audio_length는 과거 곡에 남아있지 않으므로, 저장된 mp3의 Content-Length ÷ 비트레이트로 추정.
// 배치(limit)로 나눠 반복 호출. { processed, updated, remaining } 반환.
import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { estimateMp3Duration } from '@/services/storage.service'

export const maxDuration = 60

export async function POST(req: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 30, 1), 100)

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('songs')
    .select('id, audio_url')
    .is('duration', null)
    .not('audio_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  for (const r of rows ?? []) {
    const url = r.audio_url as string | null
    if (!url) continue
    const sec = await estimateMp3Duration(url)
    if (sec == null) continue
    const { error: updErr } = await admin.from('songs').update({ duration: sec }).eq('id', r.id)
    if (!updErr) updated++
  }

  const { count: remaining } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .is('duration', null)
    .not('audio_url', 'is', null)

  return NextResponse.json({ processed: rows?.length ?? 0, updated, remaining: remaining ?? 0 })
}
