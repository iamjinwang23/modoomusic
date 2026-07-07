// 커뮤니티 허브 — 내 가입 · 인기(순위) · 신규 · 인기글
'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { CreateCommunityModal } from '@/components/community/CreateCommunityModal'
import { CommunityCard, PopularPostCard, CommunityStoryItem, CommunityRankRow } from '@/components/community/hubCards'
import type { Community, CommunityPost } from '@/types/domain'

// 허브 섹션 기본 노출 개수 (초과분은 "전체보기"로)
const HUB_LIMIT = { mine: 6, posts: 9, popular: 6, recent: 6 }

interface Hub { popular: Community[]; recent: Community[]; mine: Community[]; popularPosts: CommunityPost[] }

export default function CommunityHubPage() {
  const { user } = useAuth()
  const [hub, setHub] = useState<Hub | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/communities')
    if (!res.ok) { setHub({ popular: [], recent: [], mine: [], popularPosts: [] }); return }
    setHub(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[860px] mx-auto px-5 pt-6 pb-28 md:pb-20 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="leading-none">
              <Image src="/communication-title.svg" alt="커뮤니티" width={202} height={22} priority className="w-[140px] md:w-[202px]" />
            </h1>
          </div>
          <button
            onClick={() => user ? setCreateOpen(true) : window.dispatchEvent(new Event('open-login'))}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition active:scale-[0.98]"
          >
            <Image src="/Add.svg" alt="" width={15} height={15} style={{ filter: 'invert(1)' }} /> 만들기
          </button>
        </header>

        {hub === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">{[0,1,2].map(i => <div key={i} className="aspect-[16/9] rounded-xl bg-white/[0.04] shimmer" />)}</div>
        ) : (
          <>
            {hub.mine.length > 0 && (
              <Section title="내 커뮤니티">
                {/* 인스타 스토리식 가로 배치 — 프로필(원형 아바타) 위주. 새 글(최신)순 정렬 */}
                <div className="flex gap-4 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {[...hub.mine].sort((a, b) => (b.recentPostCount ?? 0) - (a.recentPostCount ?? 0)).map(c => <CommunityStoryItem key={c.id} c={c} />)}
                </div>
              </Section>
            )}

            {hub.popularPosts.length > 0 && (
              <Section title="인기 글" href={hub.popularPosts.length >= HUB_LIMIT.posts ? '/community/list?type=posts' : undefined}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">
                  {hub.popularPosts.slice(0, HUB_LIMIT.posts).map((p, i) => (
                    <div key={p.id} className={i === 0 ? 'col-span-2 md:col-span-1' : ''}>
                      <PopularPostCard p={p} compact={i !== 0} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="인기 커뮤니티" href={hub.popular.length > HUB_LIMIT.popular ? '/community/list?type=popular' : undefined}>
              {hub.popular.length === 0 ? <Empty text="아직 커뮤니티가 없어요. 첫 커뮤니티를 만들어보세요!" /> : (
                <div className="divide-y divide-white/[0.06]">{hub.popular.slice(0, HUB_LIMIT.popular).map((c, i) => <CommunityRankRow key={c.id} c={c} rank={i + 1} />)}</div>
              )}
            </Section>

            {hub.recent.length > 0 && (
              <Section title="새로 생긴 커뮤니티" href={hub.recent.length > HUB_LIMIT.recent ? '/community/list?type=new' : undefined}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">
                  {hub.recent.slice(0, HUB_LIMIT.recent).map(c => <CommunityCard key={c.id} c={c} />)}
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      {href ? (
        <Link href={href} className="inline-flex items-center gap-0.5 text-xl font-semibold text-white hover:opacity-70 transition-opacity">
          {title}
          <Image src="/Right-Line.svg" alt="전체보기" width={20} height={20} style={{ filter: 'invert(1)' }} />
        </Link>
      ) : (
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      )}
      {children}
    </section>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500 py-8 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">{text}</p>
}
