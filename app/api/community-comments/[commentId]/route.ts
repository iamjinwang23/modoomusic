// PATCH /api/community-comments/[commentId] — 본인 댓글 수정 / DELETE — 본인 또는 매니저 삭제(대댓글 cascade)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { editComment, deleteComment } from '@/services/community-post.service'

interface RouteParams { params: Promise<{ commentId: string }> }

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { commentId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { body?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const result = await editComment(user.id, commentId, typeof body.body === 'string' ? body.body : '')
  if (!result.ok) {
    const status = result.error === 'empty' ? 400 : result.error === 'not_found' ? 404 : result.error === 'forbidden' ? 403 : result.error === 'banned_word' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { commentId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await deleteComment(user.id, commentId)
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : result.error === 'forbidden' ? 403 : result.error === 'banned_word' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
