// PATCH — 본문 수정(작성자) / DELETE — 글 삭제(작성자 또는 매니저)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { deletePost, editPost } from '@/services/community-post.service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { content?: unknown; imageUrls?: unknown; songId?: unknown; pollOptions?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u): u is string => typeof u === 'string') : undefined
  const songId = body.songId === undefined ? undefined : (typeof body.songId === 'string' ? body.songId : null)
  const pollOptions = body.pollOptions === undefined ? undefined : (Array.isArray(body.pollOptions) ? body.pollOptions.filter((o): o is string => typeof o === 'string') : null)
  const result = await editPost(user.id, postId, typeof body.content === 'string' ? body.content : '', imageUrls, songId, pollOptions)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : result.error === 'empty' ? 400 : result.error === 'banned_word' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ post: result.post })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await deletePost(user.id, postId)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : result.error === 'banned_word' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
