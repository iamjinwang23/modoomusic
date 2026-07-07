// POST /api/community-posts/[postId]/pin — 고정 토글(매니저만)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { togglePin } from '@/services/community-post.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await togglePin(user.id, postId)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ pinned: result.pinned })
}
