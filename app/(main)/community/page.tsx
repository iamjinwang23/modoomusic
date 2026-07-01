// 커뮤니티 허브 — 내 가입 · 인기(순위) · 신규 · 인기글
'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { CreateCommunityModal } from '@/components/community/CreateCommunityModal'
import { profileColor } from '@/utils/profileColor'
import type { Community, CommunityPost } from '@/types/domain'

interface Hub { popular: Community[]; recent: Community[]; mine: Community[]; popularPosts: CommunityPost[] }

function coverStyle(c: Community) {
  // contain — 등록 원본이 잘리지 않고 카드 안에 전부 보이도록 (레터박스는 어두운 배경)
  if (c.coverImage) return { backgroundImage: `url(${c.coverImage})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#161922' }
  const hue = (c.id.charCodeAt(0) + c.id.charCodeAt(c.id.length - 1)) * 47
  const col = profileColor(hue)
  return { background: `linear-gradient(135deg, ${col.bg}, #161922)` }
}

function CommunityCard({ c }: { c: Community }) {
  return (
    <Link href={`/community/${c.id}`} className="block group">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden" style={coverStyle(c)}>
        <span className="absolute inset-0 ring-1 ring-inset ring-white/[0.08] rounded-xl" />
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-sm font-bold text-white truncate">{c.name}</p>
        <p className="text-[11px] text-zinc-400 truncate">멤버 {c.memberCount.toLocaleString()}{c.topic ? ` · ${c.topic}` : ''}</p>
      </div>
    </Link>
  )
}

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
      <div className="max-w-[860px] mx-auto px-5 py-6 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">커뮤니티</h1>
          </div>
          <button
            onClick={() => user ? setCreateOpen(true) : window.dispatchEvent(new Event('open-login'))}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition active:scale-[0.98]"
          >
            <Image src="/Add.svg" alt="" width={15} height={15} style={{ filter: 'invert(1)' }} /> 만들기
          </button>
        </header>

        {hub === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="aspect-[16/9] rounded-xl bg-white/[0.04] animate-pulse" />)}</div>
        ) : (
          <>
            {hub.mine.length > 0 && (
              <Section title="내 커뮤니티">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{hub.mine.map(c => <CommunityCard key={c.id} c={c} />)}</div>
              </Section>
            )}

            {hub.popularPosts.length > 0 && (
              <Section title="인기 글">
                <div className="relative">
                  <div className="flex gap-3 overflow-x-auto pb-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {hub.popularPosts.map(p => (
                      <Link key={p.id} href={`/community/${p.communityId}`} className="snap-start shrink-0 w-[240px] p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition">
                        <p className="text-sm text-zinc-200 line-clamp-3 min-h-[60px] leading-relaxed">{p.content || '(미디어 글)'}</p>
                        <p className="text-[11px] text-zinc-400 mt-3 truncate">{p.authorName ?? '익명'}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
                          <span className="flex items-center gap-1"><Image src="/Thumb-Up.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4)' }} /> {p.likeCount}</span>
                          <span className="flex items-center gap-1"><Image src="/chat.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4)' }} /> {p.commentCount}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {/* 우측 그라데이션 페이드 (둘러보기 캐러셀과 동일) */}
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#111318] via-[#111318]/60 to-transparent z-10 pointer-events-none" />
                </div>
              </Section>
            )}

            <Section title="인기 커뮤니티">
              {hub.popular.length === 0 ? <Empty text="아직 커뮤니티가 없어요. 첫 커뮤니티를 만들어보세요!" /> : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{hub.popular.map(c => <CommunityCard key={c.id} c={c} />)}</div>
              )}
            </Section>

            {hub.recent.length > 0 && (
              <Section title="새로 생긴 커뮤니티">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{hub.recent.map(c => <CommunityCard key={c.id} c={c} />)}</div>
              </Section>
            )}
          </>
        )}
      </div>

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {children}
    </section>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500 py-8 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">{text}</p>
}
