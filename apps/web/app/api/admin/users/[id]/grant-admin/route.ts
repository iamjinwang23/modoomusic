// Design Ref: §4 — POST /api/admin/users/[id]/grant-admin { permissions, reason }
// 최고관리자만 호출 가능. 다른 사용자에게 관리자 권한 + 메뉴 권한 부여.

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/admin/guard'
import { ADMIN_MODULES } from '@/lib/admin/modules'
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

  let body: { permissions?: unknown; reason?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  // permissions 검증 — 빈 배열은 불허(아무 메뉴도 못 보면 의미 없음)
  if (!Array.isArray(body.permissions)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  const allowed = new Set(ADMIN_MODULES as readonly string[])
  const permissions = (body.permissions as unknown[])
    .filter((p): p is string => typeof p === 'string')
    .filter((p) => allowed.has(p))
  if (permissions.length === 0) {
    return NextResponse.json({ error: 'no_permissions', message: '최소 1개 이상의 메뉴 권한을 선택해주세요' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: target, error: tErr } = await supabase
    .from('profiles')
    .select('id, username, is_admin, admin_permissions, deleted_at, suspended_at')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: 'internal' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  if (target.deleted_at) return NextResponse.json({ error: 'user_deleted' }, { status: 400 })
  if (target.suspended_at) return NextResponse.json({ error: 'user_suspended' }, { status: 400 })

  const beforeIsAdmin = target.is_admin ?? false
  const beforePerms = (target.admin_permissions as string[] | null) ?? null

  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'grant_admin',
        targetType: 'user',
        targetId: target.id,
        reason,
        payload: {
          username: target.username,
          before: { isAdmin: beforeIsAdmin, permissions: beforePerms },
          after: { isAdmin: true, permissions },
        },
      },
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ is_admin: true, admin_permissions: permissions })
          .eq('id', target.id)
        if (error) throw new Error(error.message)
      },
    )
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.code }, { status: 400 })
    console.error('[grant-admin]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { isAdmin: true, permissions } })
}
