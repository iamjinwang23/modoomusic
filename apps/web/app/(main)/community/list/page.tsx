// 커뮤니티 섹션 전체보기 — /community/list?type=popular|new|mine|posts
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CommunityCard, CommunityListRow, PopularPostCard } from '@/components/community/hubCards'
import type { Community, CommunityPost } from '@mono/shared'

type ListType = 'popular' | 'new' | 'mine' | 'posts'

const TITLES: Record<ListType, string> = {
  popular: '인기 커뮤니티',
  new: '새로 생긴 커뮤니티',
  mine: '내 커뮤니티',
  posts: '인기 글',
}

function CommunityListInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = (searchParams.get('type') ?? 'popular') as ListType

  const [communities, setCommunities] = useState<Community[] | null>(null)
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/communities/list?type=${type}`)
    if (!res.ok) { setCommunities([]); setPosts([]); return }
    const j = await res.json()
    setCommunities(j.communities ?? [])
    setPosts(j.posts ?? [])
  }, [type])
  useEffect(() => { load() }, [load])

  const title = TITLES[type] ?? '전체보기'
  const loading = communities === null && posts === null
  const isPosts = type === 'posts'
  const isRows = type === 'new'
  const empty = isPosts ? (posts?.length ?? 0) === 0 : (communities?.length ?? 0) === 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[860px] mx-auto px-5 pt-6 pb-28 md:pb-20 space-y-6">
        <header className="flex items-center gap-2">
          <button onClick={() => router.back()} aria-label="뒤로" className="w-8 h-8 rounded-full hover:bg-white/[0.06] flex items-center justify-center transition active:scale-90">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e4e4e7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
        </header>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">{[0,1,2,3,4,5].map(i => <div key={i} className="aspect-[16/9] rounded-xl bg-white/[0.04] shimmer" />)}</div>
        ) : empty ? (
          <p className="text-sm text-zinc-500 py-16 text-center">아직 없어요.</p>
        ) : isPosts ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">
            {posts!.map(p => <PopularPostCard key={p.id} p={p} compact />)}
          </div>
        ) : isRows ? (
          <div className="divide-y divide-white/[0.06]">
            {communities!.map(c => <CommunityListRow key={c.id} c={c} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">
            {communities!.map(c => <CommunityCard key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommunityListPage() {
  return (
    <Suspense fallback={<div className="h-full" />}>
      <CommunityListInner />
    </Suspense>
  )
}
