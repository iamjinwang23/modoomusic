// POST /api/community-posts/[postId]/poll/vote — 투표(단일, 1인 1표, 종료 후 불가)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { votePoll } from '@/services/community-post.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { optionIndex?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  if (typeof body.optionIndex !== 'number') return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const result = await votePoll(user.id, postId, body.optionIndex)
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : result.error === 'ended' || result.error === 'already_voted' || result.error === 'invalid_option' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ poll: result.poll })
}
