// POST /api/communities/[id]/join-requests/[userId]/approve — 승인(매니저만)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { approveRequest } from '@/services/community-join.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await approveRequest(user.id, id, userId)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' || result.error === 'not_pending' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
