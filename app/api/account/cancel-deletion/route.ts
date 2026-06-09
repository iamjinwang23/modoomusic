// Design Ref: account-deletion §4.2 — POST /api/account/cancel-deletion
// 인증 필요. 7일 grace 내면 deleted_at = NULL. AuthProvider가 SIGNED_IN 시 호출.

import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { restoreAccount } from '@/services/account.service'

export async function POST(req: NextRequest) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const result = await restoreAccount(user.id)
  if ('error' in result) {
    const status = result.error === 'grace_period_expired' ? 410 : 400
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ data: { ok: true } })
}
