// Design Ref: §4 — POST /api/admin/content/songs/[id]/delete { reason }
// 곡 영구 삭제 (cascade로 댓글·좋아요·신고 등 같이 정리됨)

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('content')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  let body: { reason?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: song, error: sErr } = await supabase
    .from('songs')
    .select('id, title, user_id, is_public')
    .eq('id', id)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: 'internal' }, { status: 500 })
  if (!song) return NextResponse.json({ error: 'target_not_found' }, { status: 404 })

  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'delete_song',
        targetType: 'song',
        targetId: song.id,
        reason,
        payload: { title: song.title, ownerId: song.user_id, wasPublic: song.is_public },
      },
      async () => {
        const { error } = await supabase.from('songs').delete().eq('id', song.id)
        if (error) throw new Error(error.message)
      },
    )
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.code }, { status: 400 })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
