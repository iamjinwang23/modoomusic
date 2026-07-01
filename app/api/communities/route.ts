// GET /api/communities — 허브(인기·신규·내 가입) / POST — 커뮤니티 개설(1인 1개)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createCommunity, getHub } from '@/services/community.service'
import { getPopularPosts } from '@/services/community-post.service'

export async function GET() {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  const [hub, popularPosts] = await Promise.all([getHub(user?.id), getPopularPosts(user?.id)])
  return NextResponse.json({ ...hub, popularPosts })
}

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { name?: unknown; topic?: unknown; description?: unknown; coverImage?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 2) return NextResponse.json({ error: 'name_required' }, { status: 400 })
  if (name.length > 30) return NextResponse.json({ error: 'name_too_long' }, { status: 400 })

  const result = await createCommunity(user.id, {
    name,
    topic: typeof body.topic === 'string' ? body.topic.trim().slice(0, 40) || null : null,
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 500) || null : null,
    coverImage: typeof body.coverImage === 'string' && body.coverImage ? body.coverImage : null,
  })
  if (!result.ok) {
    const status = result.error === 'already_has_community' ? 409 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ community: result.community })
}
