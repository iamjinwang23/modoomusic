// POST /api/communities/[id]/join — 가입
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { joinCommunity } from '@/services/community.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await joinCommunity(user.id, id)
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : result.error === 'community_closing' ? 403 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
