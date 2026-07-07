// POST /api/communities/[id]/leave — 탈퇴 (매니저는 불가)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { leaveCommunity } from '@/services/community.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await leaveCommunity(user.id, id)
  if (!result.ok) {
    const status = result.error === 'manager_cannot_leave' ? 400 : result.error === 'not_found' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
