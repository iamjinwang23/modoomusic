// GET /api/communities/list?type=popular|new|mine|posts — 섹션 전체 리스트(전체보기)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getCommunityList } from '@/services/community.service'
import { getPopularPosts } from '@/services/community-post.service'

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()

  if (type === 'posts') {
    const posts = await getPopularPosts(user?.id, 100)
    return NextResponse.json({ type, posts })
  }
  if (type === 'popular' || type === 'new' || type === 'mine') {
    const communities = await getCommunityList(type, user?.id, 100)
    return NextResponse.json({ type, communities })
  }
  return NextResponse.json({ error: 'invalid_type' }, { status: 400 })
}
