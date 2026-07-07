// Design Ref: account-deletion §4.1 — POST /api/account/delete
// 인증 필요. soft delete + 사유 로그 (user_id 미저장)

import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { requestDeletion, isDeletionReason } from '@/services/account.service'

export async function POST(req: NextRequest) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { reason_category?: unknown; reason_text?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }

  if (!isDeletionReason(body.reason_category)) {
    return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
  }
  const reasonText = typeof body.reason_text === 'string' ? body.reason_text.slice(0, 200) : ''

  const result = await requestDeletion(user.id, body.reason_category, reasonText)
  if ('error' in result) {
    const status = result.error === 'already_deleted' ? 409 : 400
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ data: { ok: true } })
}
