// GET /api/explore/feed?tab=recommended|latest|popular — 공개곡 탐색 피드(BFF)
// 앱 탐색 탭이 재사용. 서버컴포넌트로만 렌더되던 탐색 피드를 REST로 노출.
import { NextRequest, NextResponse } from 'next/server'
import { exploreService, type FeedTab } from '@/services/explore.service'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBlockedUserIds } from '@/services/block.service'

const TABS: FeedTab[] = ['recommended', 'latest', 'popular']

export async function GET(req: NextRequest) {
  const tabParam = req.nextUrl.searchParams.get('tab')
  const tab: FeedTab = TABS.includes(tabParam as FeedTab) ? (tabParam as FeedTab) : 'recommended'
  let songs = await exploreService.getFeed(tab, 60)
  // ⚠️ exploreService의 filterBlocked는 브라우저 client 기반(auth.getUser())이라
  // 서버 라우트(앱 BFF)에선 user를 못 얻어 스킵됨 → 여기서 서버 인증으로 직접 필터.
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const blocked = new Set(await getBlockedUserIds(createAdminClient(), user.id))
    if (blocked.size > 0) songs = songs.filter((s) => !blocked.has(s.userId))
  }
  return NextResponse.json({ tab, songs })
}
