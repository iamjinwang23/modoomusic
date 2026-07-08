// GET /api/communities/[id]/posts — 피드 / POST — 글 작성(멤버만)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { listPosts, createPost } from '@/services/community-post.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  const previewPostId = new URL(req.url).searchParams.get('preview') ?? undefined
  const posts = await listPosts(id, user?.id, { previewPostId })
  return NextResponse.json({ posts })
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { content?: unknown; imageUrls?: unknown; linkUrl?: unknown; songId?: unknown; pollOptions?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }

  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u): u is string => typeof u === 'string') : []
  const pollOptions = Array.isArray(body.pollOptions) ? body.pollOptions.filter((o): o is string => typeof o === 'string') : []
  const result = await createPost(user.id, id, {
    content: typeof body.content === 'string' ? body.content : '',
    imageUrls,
    linkUrl: typeof body.linkUrl === 'string' && body.linkUrl ? body.linkUrl : null,
    songId: typeof body.songId === 'string' && body.songId ? body.songId : null,
    poll: pollOptions.length >= 2 ? { options: pollOptions } : null,
  })
  if (!result.ok) {
    const status = result.error === 'not_member' || result.error === 'community_closing' ? 403 : result.error === 'empty' ? 400 : result.error === 'banned_word' ? 400 : result.error === 'song_not_public' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ post: result.post })
}
