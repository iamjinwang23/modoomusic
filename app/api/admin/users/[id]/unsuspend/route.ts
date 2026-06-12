// Design Ref: §4 — POST /api/admin/users/[id]/unsuspend { reason }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

  let body: { reason?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: target, error: tErr } = await supabase
    .from('profiles')
    .select('id, username, suspended_at')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: 'internal' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  if (!target.suspended_at) return NextResponse.json({ error: 'not_suspended' }, { status: 400 })

  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'unsuspend_user',
        targetType: 'user',
        targetId: target.id,
        reason,
        payload: { username: target.username, before: { suspendedAt: target.suspended_at }, after: { suspendedAt: null } },
      },
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ suspended_at: null, suspended_reason: null, suspended_by: null })
          .eq('id', target.id)
        if (error) throw new Error(error.message)
      },
    )
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.code }, { status: 400 })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { suspended: false } })
}
