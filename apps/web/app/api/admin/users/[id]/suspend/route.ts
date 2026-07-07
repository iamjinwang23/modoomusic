// Design Ref: §4 — POST /api/admin/users/[id]/suspend { reason }
// suspended_at에 timestamp 기록, 사유 + 감사 로그

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('users')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (id === auth.ctx.userId) {
    return NextResponse.json({ error: 'self_action' }, { status: 400 })
  }

  let body: { reason?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: target, error: tErr } = await supabase
    .from('profiles')
    .select('id, username, suspended_at, is_admin')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: 'internal' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  if (target.is_admin) return NextResponse.json({ error: 'cannot_suspend_admin' }, { status: 400 })
  if (target.suspended_at) return NextResponse.json({ error: 'already_suspended' }, { status: 400 })

  const now = new Date().toISOString()
  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'suspend_user',
        targetType: 'user',
        targetId: target.id,
        reason,
        payload: { username: target.username, before: { suspendedAt: null }, after: { suspendedAt: now } },
      },
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ suspended_at: now, suspended_reason: reason, suspended_by: auth.ctx.userId })
          .eq('id', target.id)
        if (error) throw new Error(error.message)
      },
    )
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.code }, { status: 400 })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { suspended: true } })
}
