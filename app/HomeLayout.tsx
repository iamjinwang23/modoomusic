'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { SongForm } from '@/features/song/components/SongForm'
import { MyWorkPanel } from '@/features/song/components/MyWorkPanel'
import { ExplorePanel } from '@/features/explore/components/ExplorePanel'
import { ProfilePanel } from '@/features/explore/components/ProfilePanel'
import { SongDetailPage } from '@/components/SongDetailPage'
import { LoginModal } from '@/components/LoginModal'
import { GlobalMiniBar } from '@/components/GlobalMiniBar'
import { useAuth } from '@/components/AuthProvider'

type Section = 'create' | 'archive' | 'explore' | 'notifications' | 'profile' | 'song'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'create',        label: '음악 만들기', icon: '/Music-Create.svg' },
  { id: 'archive',       label: '라이브러리',   icon: '/Music-Library.svg' },
  { id: 'explore',       label: '탐색',        icon: '/Compass.svg' },
  { id: 'notifications', label: '알림',        icon: '/Notification.svg' },
]


function EmptyPanel({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
      {title} 준비 중
    </div>
  )
}


export function HomeLayout() {
  const [activeSection, setActiveSection] = useState<Section>('create')
  const [prevSection, setPrevSection] = useState<Section>('create')
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { user, signOut } = useAuth()

  useEffect(() => {
    function handleViewProfile(e: Event) {
      const username = (e as CustomEvent<string>).detail
      setProfileUsername(username)
      setActiveSection('profile')
    }
    function handleViewSong() {
      setPrevSection((prev) => prev === 'song' ? prev : activeSection as Section)
      setActiveSection('song')
    }
    function handleOpenLogin() { setLoginOpen(true) }
    window.addEventListener('view-profile', handleViewProfile)
    window.addEventListener('view-song', handleViewSong)
    window.addEventListener('open-login', handleOpenLogin)
    return () => {
      window.removeEventListener('view-profile', handleViewProfile)
      window.removeEventListener('view-song', handleViewSong)
      window.removeEventListener('open-login', handleOpenLogin)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  const isCreate = activeSection === 'create'

  function renderCenter() {
    switch (activeSection) {
      case 'create':        return <div className="px-6 py-6"><h1 className="text-xl font-semibold mb-6">음악 만들기</h1><SongForm /></div>
      case 'archive':       return <MyWorkPanel showCollections />
      case 'explore':       return <ExplorePanel />
      case 'profile':       return profileUsername ? <ProfilePanel username={profileUsername} /> : null
      case 'notifications': return <EmptyPanel title="알림" />
      case 'song':
        return <SongDetailPage onBack={() => setActiveSection(prevSection)} />
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#171A20] text-white overflow-hidden select-none">

      {/* ── Header ── */}
      <header className="shrink-0 h-14 flex items-center px-5 border-b border-white/[0.06] bg-[#111318] z-20">
        <button onClick={() => setActiveSection('create')}>
          <Image src="/logo.svg" alt="모두의 노래" width={72} height={16} style={{ filter: 'invert(1)' }} />
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* 모바일 내 음악 버튼 */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 border border-white/10 px-3 py-1.5 rounded-full hover:border-white/20 transition-colors md:hidden"
          >
            <span>🎵</span> 라이브러리
          </button>

          {/* 로그인 / 아바타 */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-opacity hover:opacity-80"
                style={{ background: `hsl(${(user.id.charCodeAt(0) * 137) % 360},60%,45%)` }}
              >
                {(user.user_metadata?.full_name ?? user.email ?? '?').slice(0, 2).toUpperCase()}
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[54]" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-[55] w-44 bg-[#21252E] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.06]">
                      <p className="text-xs font-medium text-white truncate">
                        {user.user_metadata?.full_name ?? '사용자'}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">{user.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        const username = user.user_metadata?.username ?? user.email?.split('@')[0] ?? user.id.slice(0, 8)
                        window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-white hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      내 프로필
                    </button>
                    <button
                      onClick={() => { setUserMenuOpen(false); signOut() }}
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
            {NAV_ITEMS.map(({ id, label, icon }) => {
              const active = activeSection === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base transition-colors text-left ${
                    active
                      ? 'font-bold text-white bg-white/[0.06]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Image src={icon} alt="" width={18} height={18} style={{ filter: active ? VIOLET_FILTER : 'invert(0.4)' }} />
                  {label}
                </button>
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
            <button className="relative w-full py-2.5 rounded-xl border border-violet-600 text-violet-400 text-sm font-medium overflow-hidden group hover:text-white transition-colors duration-300">
              <span className="absolute inset-0 bg-violet-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center" />
              <span className="relative">플랜 업그레이드</span>
            </button>
            <div className="flex justify-center gap-3 px-1">
              <a href="#" className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">이용약관</a>
              <a href="#" className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">개인정보처리방침</a>
            </div>
            <p className="text-center text-[10px] text-zinc-700 font-mono">© 2026 mono</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Center panel */}
            <div className={
              isCreate
                ? 'overflow-y-auto w-full md:w-[560px] md:shrink-0 border-r border-white/[0.06]'
                : (activeSection === 'archive' || activeSection === 'explore' || activeSection === 'profile' || activeSection === 'song')
                  ? 'flex-1 flex flex-col overflow-hidden'
                  : 'flex-1 overflow-y-auto'
            }>
              {renderCenter()}
            </div>

            {/* Right My Work panel — 음악 만들기에서만 */}
            {isCreate && (
              <aside className="hidden md:flex flex-1 min-w-[260px] flex-col overflow-hidden">
                <MyWorkPanel />
              </aside>
            )}
          </div>

          {/* Global Mini Player — 본문 영역 하단 */}
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

      {/* Login Modal */}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}

    </div>
  )
}
