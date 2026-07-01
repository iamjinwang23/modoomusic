// POST /api/communities/[id]/kick — 멤버 강퇴(매니저만). { userId }
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { kickMember } from '@/services/community.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { userId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  if (typeof body.userId !== 'string') return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const result = await kickMember(user.id, id, body.userId)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : result.error === 'cannot_kick_manager' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
