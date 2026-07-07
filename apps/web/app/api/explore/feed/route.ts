// GET /api/explore/feed?tab=recommended|latest|popular — 공개곡 탐색 피드(BFF)
// 앱 탐색 탭이 재사용. 서버컴포넌트로만 렌더되던 탐색 피드를 REST로 노출.
import { NextRequest, NextResponse } from 'next/server'
import { exploreService, type FeedTab } from '@/services/explore.service'

const TABS: FeedTab[] = ['recommended', 'latest', 'popular']

export async function GET(req: NextRequest) {
  const tabParam = req.nextUrl.searchParams.get('tab')
  const tab: FeedTab = TABS.includes(tabParam as FeedTab) ? (tabParam as FeedTab) : 'recommended'
  const songs = await exploreService.getFeed(tab, 60)
  return NextResponse.json({ tab, songs })
}
