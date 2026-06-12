// Design Ref: §4 — POST /api/admin/users/[id]/revoke-admin { reason }
// 최고관리자만 호출. 관리자 권한 회수.
// 최고관리자(NULL permissions)는 회수 불가 — 본인 보호 + 시스템 보호.

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireSuperAdminApi()
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
    .select('id, username, is_admin, admin_permissions')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: 'internal' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  if (!target.is_admin) return NextResponse.json({ error: 'not_admin' }, { status: 400 })
  // 다른 최고관리자(NULL permissions)는 회수 불가
  if (target.admin_permissions === null) {
    return NextResponse.json({ error: 'cannot_revoke_super', message: '최고관리자는 권한 회수할 수 없어요' }, { status: 400 })
  }

  const beforePerms = (target.admin_permissions as string[] | null) ?? null

  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'revoke_admin',
        targetType: 'user',
        targetId: target.id,
        reason,
        payload: {
          username: target.username,
          before: { isAdmin: true, permissions: beforePerms },
          after: { isAdmin: false, permissions: null },
        },
      },
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ is_admin: false, admin_permissions: null })
          .eq('id', target.id)
        if (error) throw new Error(error.message)
      },
    )
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.code }, { status: 400 })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { isAdmin: false } })
}
