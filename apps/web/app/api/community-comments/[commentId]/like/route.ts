// POST /api/community-comments/[commentId]/like — 댓글 좋아요 토글
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { toggleCommentLike } from '@/services/community-post.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await toggleCommentLike(user.id, commentId)
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : (result.error === 'not_member' || result.error === 'community_closing' ? 403 : 500)
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ liked: result.liked, likeCount: result.likeCount })
}
