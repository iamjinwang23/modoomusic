// POST /api/communities/[id]/join — 공개=즉시 가입 / 비공개=가입 신청
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { joinCommunity } from '@/services/community.service'
import { requestJoin } from '@/services/community-join.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const result = await joinCommunity(user.id, id)
  if (result.ok) return NextResponse.json({ ok: true, joined: true })

  // 비공개 → 신청으로 위임
  if (result.error === 'needs_request') {
    const req = await requestJoin(user.id, id)
    if (req.ok) return NextResponse.json({ ok: true, requested: true, status: req.status })
    const status = req.error === 'not_found' ? 404 : req.error === 'blocked' || req.error === 'rejoin_cooldown' || req.error === 'community_closing' ? 403 : 500
    return NextResponse.json({ error: req.error }, { status })
  }
  const status = result.error === 'not_found' ? 404 : result.error === 'community_closing' || result.error === 'blocked' ? 403 : 500
  return NextResponse.json({ error: result.error }, { status })
}
