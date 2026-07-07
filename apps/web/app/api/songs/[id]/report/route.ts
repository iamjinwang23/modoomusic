// POST /api/songs/[id]/report — 곡 신고
// 인증 필요. 같은 곡 중복 신고는 409 (멱등 처리).
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { REPORT_REASONS } from '@/services/report.service'

const REASONS = REPORT_REASONS as readonly string[]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { id: songId } = await params
  let body: { reason?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const reason = typeof body.reason === 'string' ? body.reason : null
  if (!reason || !REASONS.includes(reason)) {
    return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
  }

  const { error } = await supabase
    .from('song_reports')
    .insert({ reporter_id: user.id, song_id: songId, reason })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'already_reported' }, { status: 409 })
    console.error('[song-report]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
