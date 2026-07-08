// POST /api/communities/[id]/join-requests/[userId]/reject — 거절(매니저만). { reason? }
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { rejectRequest } from '@/services/community-join.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { reason?: unknown } = {}
  try { body = await req.json() } catch { /* reason 선택 */ }
  const reason = typeof body.reason === 'string' ? body.reason : undefined
  const result = await rejectRequest(user.id, id, userId, reason)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' || result.error === 'not_pending' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
