// GET /api/community-posts/[postId]/comments — 목록 / POST — 댓글 작성
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { listComments, addComment } from '@/services/community-post.service'

interface RouteParams { params: Promise<{ postId: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { postId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  const comments = await listComments(postId, user?.id)
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { postId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { body?: unknown; parentId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const parentId = typeof body.parentId === 'string' ? body.parentId : null
  const result = await addComment(user.id, postId, typeof body.body === 'string' ? body.body : '', parentId)
  if (!result.ok) {
    const status = result.error === 'empty' ? 400 : result.error === 'not_found' ? 404 : result.error === 'community_closing' || result.error === 'not_member' ? 403 : result.error === 'bad_parent' ? 400 : result.error === 'banned_word' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
