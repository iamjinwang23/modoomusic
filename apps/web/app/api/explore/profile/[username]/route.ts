// GET /api/explore/profile/[username] — 크리에이터 프로필 + 공개곡(BFF)
// 앱 크리에이터 페이지가 재사용. isFollowing은 authed 클라로 보정.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { exploreService } from '@/services/explore.service'

interface RouteParams { params: Promise<{ username: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { username } = await params
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profile, songs] = await Promise.all([
    exploreService.getProfile(username, user?.id),
    exploreService.getUserSongs(username, 60),
  ])
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 익명 클라 기반 exploreService의 isFollowing 보정(authed로 정확히 재확인)
  if (user && profile.userId !== user.id) {
    const { count } = await supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('follower_id', user.id)
      .eq('following_id', profile.userId)
    profile.isFollowing = (count ?? 0) > 0
  }

  return NextResponse.json({ profile, songs })
}
