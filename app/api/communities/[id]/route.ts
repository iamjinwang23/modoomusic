// GET /api/communities/[id] — 상세 + 멤버 / PATCH — 정보 수정(매니저) / DELETE — 폐쇄(매니저만)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getCommunity, listMembers, closeCommunity, updateCommunity } from '@/services/community.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  const community = await getCommunity(id, user?.id)
  if (!community) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const members = await listMembers(id)
  return NextResponse.json({ community, members })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { name?: unknown; topic?: unknown; description?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const patch: { name?: string; topic?: string | null; description?: string | null } = {}
  if (typeof body.name === 'string') patch.name = body.name
  if (typeof body.topic === 'string' || body.topic === null) patch.topic = body.topic as string | null
  if (typeof body.description === 'string' || body.description === null) patch.description = body.description as string | null
  const result = await updateCommunity(user.id, id, patch)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : result.error === 'invalid_name' ? 400 : result.error === 'empty' ? 400 : result.error === 'banned_word' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ community: result.community })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await closeCommunity(user.id, id)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : result.error === 'already_closing' ? 409 : result.error === 'banned_word' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  // deleted=true 즉시 삭제 / false 14일 유예 예약(closeScheduledAt)
  return NextResponse.json({ ok: true, deleted: result.deleted, closeScheduledAt: result.closeScheduledAt })
}
