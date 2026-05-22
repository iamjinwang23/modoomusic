'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { MyWorkPanel } from '@/features/song/components/MyWorkPanel'
import { SongDetailPage } from '@/components/SongDetailPage'
import { LoginModal } from '@/components/LoginModal'
import { OnboardingModal } from '@/components/OnboardingModal'
import { ComingSoonModal } from '@/components/ComingSoonModal'
import { CreditIndicator } from '@/components/CreditIndicator'
import { GenerationChip } from '@/components/GenerationChip'
import { GlobalMiniBar } from '@/components/GlobalMiniBar'
import { useAuth } from '@/components/AuthProvider'

const PROFILE_PALETTE = [
  { bg: 'hsl(87,57%,73%)',  text: 'hsl(87,45%,32%)'  },
  { bg: 'hsl(261,76%,75%)', text: 'hsl(261,55%,35%)' },
  { bg: 'hsl(40,60%,82%)',  text: 'hsl(40,50%,35%)'  },
  { bg: 'hsl(129,33%,77%)', text: 'hsl(129,30%,30%)' },
  { bg: 'hsl(0,49%,80%)',   text: 'hsl(0,40%,35%)'   },
  { bg: 'hsl(22,73%,75%)',  text: 'hsl(22,55%,35%)'  },
]

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

const NAV_ITEMS: { href: string; label: string; icon: string }[] = [
  { href: '/',              label: '음악 만들기', icon: '/Music-Create.svg' },
  { href: '/library',       label: '라이브러리',   icon: '/Music-Library.svg' },
  { href: '/explore',       label: '탐색',        icon: '/Compass.svg' },
  { href: '/notifications', label: '알림',        icon: '/Notification.svg' },
]

function isActiveNav(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function MainShellLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, signOut } = useAuth()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [comingSoon, setComingSoon] = useState<null | 'sidebar' | 'locked-model' | 'daily-limit'>(null)
  const [songOverlayOpen, setSongOverlayOpen] = useState(false)

  // 신규 가입자 온보딩
  useEffect(() => {
    if (user && profile && !profile.onboardingDone) setOnboardingOpen(true)
  }, [user, profile])

  // 글로벌 이벤트 핸들러
  useEffect(() => {
    function onViewProfile(e: Event) {
      const username = (e as CustomEvent<string>).detail
      if (username) router.push(`/profile/${username}`)
    }
    function onViewSong() { setSongOverlayOpen(true) }
    function onOpenLogin() { setLoginOpen(true) }
    function onComingSoon(e: Event) {
      const reason = (e as CustomEvent<typeof comingSoon>).detail
      setComingSoon(reason ?? 'sidebar')
    }
    window.addEventListener('view-profile', onViewProfile)
    window.addEventListener('view-song', onViewSong)
    window.addEventListener('open-login', onOpenLogin)
    window.addEventListener('open-coming-soon', onComingSoon)
    return () => {
      window.removeEventListener('view-profile', onViewProfile)
      window.removeEventListener('view-song', onViewSong)
      window.removeEventListener('open-login', onOpenLogin)
      window.removeEventListener('open-coming-soon', onComingSoon)
    }
  }, [router])

  // 라우트 변경 시 song overlay 자동 닫기 (페이지 이동하면 상세 닫힘)
  useEffect(() => {
    setSongOverlayOpen(false)
  }, [pathname])

  const isCreate = pathname === '/'

  const headerInitial = (profile?.displayName ?? user?.user_metadata?.full_name ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  const paletteIdx = user ? (user.id.charCodeAt(0) * 137) % PROFILE_PALETTE.length : 0

  return (
    <div className="flex flex-col h-screen bg-[#171A20] text-white overflow-hidden select-none">

      {/* ── Header ── */}
      <header className="shrink-0 h-14 flex items-center px-5 border-b border-white/[0.06] bg-[#111318] z-20">
        <Link href="/">
          <Image src="/logo.svg" alt="모두의 노래" width={72} height={16} style={{ filter: 'invert(1)' }} />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/10 px-3 py-1.5 rounded-full hover:border-white/20 transition-colors md:hidden"
          >
            <span>🎵</span> 라이브러리
          </button>

          {user && <GenerationChip />}
          {user && <CreditIndicator />}

          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-80"
                style={profile?.avatarUrl ? undefined : { background: PROFILE_PALETTE[paletteIdx].bg, color: PROFILE_PALETTE[paletteIdx].text }}
              >
                {profile?.avatarUrl ? (
                  <Image src={profile.avatarUrl} alt="" width={32} height={32} className="object-cover w-full h-full" unoptimized />
                ) : headerInitial}
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[54]" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-[55] w-44 bg-[#21252E] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <p className="text-xs font-medium text-white truncate">
                        {profile?.displayName ?? user.user_metadata?.full_name ?? '사용자'}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">{user.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        const username = profile?.username ?? user.user_metadata?.username ?? user.email?.split('@')[0] ?? user.id.slice(0, 8)
                        router.push(`/profile/${username}`)
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-white hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      내 프로필
                    </button>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        window.dispatchEvent(new Event('song-updated'))
                        window.dispatchEvent(new Event('collection-updated'))
                        router.push('/')
                        signOut()
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      로그아웃
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setLoginOpen(true)}
              className="text-sm text-white border border-white px-3 py-1.5 rounded-full hover:bg-white/[0.08] transition-colors"
            >
              로그인
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-gradient-to-b from-[#111318] from-50% to-[#12151E]">
          <nav className="flex-1 px-3 py-3 space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon }) => {
              const active = isActiveNav(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base transition-colors text-left ${
                    active
                      ? 'font-bold text-white bg-white/[0.06]'
                      : 'text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Image src={icon} alt="" width={18} height={18} style={{ filter: active ? VIOLET_FILTER : 'invert(0.4)' }} />
                  {label}
                </Link>
              )
            })}
            {/* 혜택 — 준비 중 */}
            <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base text-zinc-600 cursor-default select-none">
              <Image src="/Gift-Card.svg" alt="" width={18} height={18} style={{ filter: 'invert(0.25)' }} />
              혜택
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 leading-none">준비 중</span>
            </div>
          </nav>
          <div className="p-3 space-y-2">
            <button
              onClick={() => setComingSoon('sidebar')}
              className="relative w-full py-2.5 rounded-xl border border-violet-600 text-violet-400 text-sm font-medium overflow-hidden group hover:text-white transition-colors duration-300"
            >
              <span className="absolute inset-0 bg-violet-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center" />
              <span className="relative">플랜 업그레이드</span>
            </button>
            <div className="flex justify-center gap-3 px-1">
              <Link href="/terms" className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">이용약관</Link>
              <Link href="/privacy" className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">개인정보처리방침</Link>
            </div>
            <p className="text-center text-[10px] text-zinc-700 font-mono">© 2026 mono</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Center panel — 페이지가 직접 렌더 */}
            <div
              className={
                songOverlayOpen
                  ? 'flex-1 flex flex-col overflow-hidden'
                  : isCreate
                    ? 'overflow-y-auto w-full md:w-[560px] md:shrink-0 border-r border-white/[0.06]'
                    : 'flex-1 flex flex-col overflow-hidden'
              }
            >
              {songOverlayOpen ? (
                <SongDetailPage onBack={() => setSongOverlayOpen(false)} />
              ) : (
                children
              )}
            </div>

            {/* Right My Work panel — 음악 만들기에서만 + 곡 상세 오버레이가 아닐 때 */}
            {isCreate && !songOverlayOpen && (
              <aside className="hidden md:flex flex-1 min-w-[260px] flex-col overflow-hidden">
                <MyWorkPanel />
              </aside>
            )}
          </div>

          {/* Global Mini Player */}
          <GlobalMiniBar />
        </main>

      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-[300px] bg-[#1A1D24] border-l border-white/[0.08] z-50 flex flex-col md:hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
              <span className="text-sm font-medium">라이브러리</span>
              <button onClick={() => setDrawerOpen(false)} className="text-zinc-500 hover:text-white transition-colors p-1">✕</button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MyWorkPanel />
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      {onboardingOpen && user && (
        <OnboardingModal
          user={user}
          onDone={() => { setOnboardingOpen(false); setLoginOpen(false) }}
        />
      )}
      {comingSoon && (
        <ComingSoonModal reason={comingSoon} onClose={() => setComingSoon(null)} />
      )}
    </div>
  )
}
