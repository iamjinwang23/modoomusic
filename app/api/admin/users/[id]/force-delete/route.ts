// Design Ref: §4 — POST /api/admin/users/[id]/force-delete { reason }
// 기존 finalize_account_deletion RPC 사용 — 즉시 익명화 + auth.users 삭제

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi()
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
    .select('id, username, is_admin')
    .eq('id', id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: 'internal' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  if (target.is_admin) return NextResponse.json({ error: 'cannot_delete_admin' }, { status: 400 })

  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'force_delete_user',
        targetType: 'user',
        targetId: target.id,
        reason,
        payload: { username: target.username },
      },
      async () => {
        // 1) 기존 finalize RPC로 즉시 익명화 + 컨텐츠 정리
        const { error: rpcErr } = await supabase.rpc('finalize_account_deletion', { target_id: target.id })
        if (rpcErr) throw new Error(`finalize: ${rpcErr.message}`)
        // 2) auth.users에서 삭제 (로그인 차단)
        const { error: delErr } = await supabase.auth.admin.deleteUser(target.id)
        if (delErr) throw new Error(`auth delete: ${delErr.message}`)
      },
    )
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.code }, { status: 400 })
    console.error('[force-delete]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
