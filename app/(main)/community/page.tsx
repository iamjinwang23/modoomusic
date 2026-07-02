// 커뮤니티 허브 — 내 가입 · 인기(순위) · 신규 · 인기글
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { CreateCommunityModal } from '@/components/community/CreateCommunityModal'
import { ScrollToTopButton } from '@/components/community/ScrollToTopButton'
import type { Community, CommunityPost } from '@/types/domain'

const GRAY_COVER = '#363A47'       // 커버 기본 배경
const GRAY_AVATAR = '#3E4250'      // 아바타 기본 배경
const GRAY_AVATAR_TEXT = '#A8B0BC' // 아바타 이니셜 색상

interface Hub { popular: Community[]; recent: Community[]; mine: Community[]; popularPosts: CommunityPost[] }

function coverStyle(c: Community) {
  if (c.coverImage) return { backgroundImage: `url(${c.coverImage})`, backgroundSize: 'cover', backgroundPosition: c.coverFocus ?? 'center', backgroundRepeat: 'no-repeat' }
  return { background: GRAY_COVER }
}

function CommunityCard({ c }: { c: Community }) {
  return (
    <Link href={`/community/${c.id}`} className="block group">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden" style={coverStyle(c)}>
        <span className="absolute inset-0 ring-1 ring-inset ring-white/[0.08] rounded-xl" />
      </div>
      <div className="mt-2.5 flex items-center gap-2.5 px-0.5">
        <div className="shrink-0 w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center text-sm font-bold" style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
          {c.avatarImage ? <img src={c.avatarImage} alt="" className="w-full h-full object-cover" /> : c.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{c.name}</p>
          <p className="text-[11px] text-zinc-400 truncate">멤버 {c.memberCount.toLocaleString()} · 새 글 {(c.recentPostCount ?? 0)}</p>
        </div>
      </div>
    </Link>
  )
}

function getYouTubeThumb(url: string): string | null {
  try {
    const u = new URL(url)
    let vid: string | null = null
    if (u.hostname.includes('youtube.com')) vid = u.searchParams.get('v')
    else if (u.hostname === 'youtu.be') vid = u.pathname.slice(1).split('?')[0]
    return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null
  } catch { return null }
}

// 본문 첫 URL 추출 (임베드는 이제 본문에 넣은 링크로 자동 인식)
function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : null
}

// 인기 글 카드 — 썸네일 우선순위: 첨부 이미지 → 첨부 곡 커버 → YT 썸네일 → 링크 OG → 커뮤니티 커버 → 회색
function PopularPostCard({ p }: { p: CommunityPost }) {
  const directThumb = (p.imageUrls && p.imageUrls[0]) || p.song?.coverImage || null
  const embedUrl = p.linkUrl || firstUrl(p.content)   // 명시 첨부 우선, 없으면 본문 첫 URL
  const ytThumb = embedUrl ? getYouTubeThumb(embedUrl) : null
  const [ogImage, setOgImage] = useState<string | null>(null)

  useEffect(() => {
    if (directThumb || ytThumb || !embedUrl) return
    let alive = true
    fetch(`/api/og?url=${encodeURIComponent(embedUrl)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.image) setOgImage(d.image) })
      .catch(() => {})
    return () => { alive = false }
  }, [directThumb, ytThumb, embedUrl])

  const thumb = directThumb || ytThumb || ogImage || p.communityCover || null

  return (
    <Link href={`/community/${p.communityId}?post=${p.id}`} className="block group">
      <div
        className="relative aspect-[16/9] rounded-xl overflow-hidden"
        style={thumb ? undefined : { background: GRAY_COVER }}
      >
        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
        <span className="absolute inset-0 ring-1 ring-inset ring-white/[0.08] rounded-xl" />
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-sm font-bold text-white line-clamp-2">{p.content || '(미디어 글)'}</p>
        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{p.communityName ?? '커뮤니티'}</p>
        <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Image src="/Thumb-Up.svg" alt="" width={11} height={11} style={{ filter: 'invert(0.4)' }} />
            {p.likeCount}
          </span>
          <span className="flex items-center gap-1">
            <Image src="/chat.svg" alt="" width={11} height={11} style={{ filter: 'invert(0.4)' }} />
            {p.commentCount}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function CommunityHubPage() {
  const { user } = useAuth()
  const [hub, setHub] = useState<Hub | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/communities')
    if (!res.ok) { setHub({ popular: [], recent: [], mine: [], popularPosts: [] }); return }
    setHub(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="max-w-[860px] mx-auto px-5 py-6 space-y-8">
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">{hub.mine.map(c => <CommunityCard key={c.id} c={c} />)}</div>
              </Section>
            )}

            {hub.popularPosts.length > 0 && (
              <Section title="인기 글">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">
                  {hub.popularPosts.map((p, i) => (
                    <div key={p.id} className={i === 0 ? 'col-span-2 md:col-span-1' : ''}>
                      <PopularPostCard p={p} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="인기 커뮤니티">
              {hub.popular.length === 0 ? <Empty text="아직 커뮤니티가 없어요. 첫 커뮤니티를 만들어보세요!" /> : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6">{hub.popular.map(c => <CommunityCard key={c.id} c={c} />)}</div>
              )}
            </Section>

            {hub.recent.length > 0 && (
              <Section title="새로 생긴 커뮤니티">
                <div className="divide-y divide-white/[0.06]">
                  {hub.recent.map(c => {
                    return (
                      <Link key={c.id} href={`/community/${c.id}`} className="flex items-center gap-3.5 py-3 hover:bg-white/[0.03] transition">
                        {/* 커뮤니티 프로필 */}
                        <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center text-base font-bold" style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
                          {c.avatarImage ? <img src={c.avatarImage} alt="" className="w-full h-full object-cover" /> : c.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white truncate">{c.name}</p>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">멤버 {c.memberCount.toLocaleString()} · 새 글 {(c.recentPostCount ?? 0)}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ScrollToTopButton scrollRef={scrollRef} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500 py-8 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">{text}</p>
}
