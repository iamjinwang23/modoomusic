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
import { SongRealtimeBridge } from '@/components/SongRealtimeBridge'
import { GlobalMiniBar } from '@/components/GlobalMiniBar'
import { BottomNav } from '@/components/BottomNav'
import { NotificationPanel } from '@/components/NotificationPanel'
import { useAuth } from '@/components/AuthProvider'
import { notificationService } from '@/services/notification.service'

import { profileColor } from '@/utils/profileColor'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

const NAV_ITEMS: { href: string; label: string; icon: string }[] = [
  { href: '/',              label: '음악 만들기', icon: '/Ai-Generate-Music.svg' },
  { href: '/library',       label: '라이브러리',   icon: '/Music-Library.svg' },
  { href: '/explore',       label: '탐색',        icon: '/Publish.svg' },
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

  const [loginOpen, setLoginOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [comingSoon, setComingSoon] = useState<null | 'sidebar' | 'locked-model' | 'daily-limit'>(null)
  const [songOverlayOpen, setSongOverlayOpen] = useState(false)
  // notifications §5.1 — 데스크톱 오버레이 패널 + 미읽음 점 배지
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [notifUnread, setNotifUnread] = useState(0)

  // 미읽음 카운트 — 로그인 시 1회 + notifications-changed 이벤트로 재조회
  useEffect(() => {
    if (!user) { setNotifUnread(0); return }
    let cancelled = false
    async function load() {
      const n = await notificationService.unreadCount()
      if (!cancelled) setNotifUnread(n)
    }
    load()
    function onChanged() { load() }
    window.addEventListener('notifications-changed', onChanged)
    return () => { cancelled = true; window.removeEventListener('notifications-changed', onChanged) }
  }, [user])

  // 라우트 변경 시 알림 패널 자동 닫기 (곡 상세와 동일 패턴)
  useEffect(() => { setNotifPanelOpen(false) }, [pathname])

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

  // 라우트 변경 시 song overlay 자동 닫기
  useEffect(() => {
    setSongOverlayOpen(false)
  }, [pathname])

  // 공유 링크로 진입 시 (?song={id}) 곡 상세 자동 오픈
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const songId = params.get('song')
    if (!songId) return
    import('@/services/explore.service').then(({ exploreService }) => {
      exploreService.getPublicSongById(songId).then((pub) => {
        if (!pub) return
        window.dispatchEvent(new CustomEvent('view-song', {
          detail: {
            feed: [{
              id: pub.id, createdAt: pub.createdAt, title: pub.title, prompt: pub.prompt,
              genre: pub.genre, mood: pub.mood, customLyrics: null, lyrics: pub.lyrics,
              instrumental: pub.instrumental, audioUrl: pub.audioUrl, duration: pub.duration ?? null,
              liked: pub.isLiked, coverHue: pub.coverHue, coverImage: pub.coverImage,
            }],
            idx: 0,
            isOwner: !!user && pub.userId === user.id,
            ownerName: pub.displayName,
            ownerAvatarUrl: pub.avatarUrl ?? null,
            ownerUserId: pub.userId,
            ownerAvatarHue: pub.avatarHue ?? null,
          },
        }))
        // 쿼리 정리
        const url = new URL(window.location.href)
        url.searchParams.delete('song')
        window.history.replaceState({}, '', url.toString())
      })
    })
    // 마운트 시점 1회만 실행 (user는 deps 안 넣음 — 로딩 전엔 isOwner=false로 처리해도 무방)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isCreate = pathname === '/'

  const headerInitial = (profile?.displayName ?? user?.user_metadata?.full_name ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  // 프로필 아바타 색상 — profile.avatarHue 기반 (DB 저장값)으로 통일.
  // profile 로드 전엔 fallback (user.id 첫 글자)으로 색 유지.
  const fallbackHue = user ? user.id.charCodeAt(0) * 137 : 0
  const avatarBg = profileColor(profile?.avatarHue ?? fallbackHue)

  return (
    <div
      className="flex flex-col bg-[#171A20] text-white overflow-hidden select-none h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] md:h-screen"
    >

      {/* ── Header — 항상 상단 고정 ── */}
      <header className="relative shrink-0 h-14 flex items-center px-5 border-b border-white/[0.06] bg-[#111318] z-50">
        <Link href="/">
          <Image src="/logo.svg" alt="모두의 노래" width={72} height={16} style={{ filter: 'invert(1)' }} />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {user && <CreditIndicator />}

          {user ? (
            <div className="relative hidden md:block">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-80"
                style={profile?.avatarUrl ? undefined : { background: avatarBg.bg, color: avatarBg.text }}
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
              className="text-sm text-white border border-white/25 hover:border-white/40 px-3 py-1.5 rounded-full hover:bg-white/[0.08] transition-colors"
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
              // notifications §5.4 — 알림은 데스크톱에서 패널 토글 (라우팅 X)
              const isNotif = href === '/notifications'
              const active = isNotif ? notifPanelOpen : isActiveNav(pathname, href)
              const className = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base transition-colors text-left ${
                active ? 'font-bold text-white bg-white/[0.06]' : 'text-white hover:bg-white/[0.04]'
              }`
              const inner = (
                <>
                  <Image src={icon} alt="" width={18} height={18} style={{ filter: active ? VIOLET_FILTER : 'invert(0.4)' }} />
                  {label}
                  {isNotif && notifUnread > 0 && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}
                </>
              )
              if (isNotif) {
                return (
                  <button key={href} onClick={() => setNotifPanelOpen((v) => !v)} className={className}>
                    {inner}
                  </button>
                )
              }
              return (
                <Link key={href} href={href} className={className}>
                  {inner}
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
            <p className="text-center text-[10px] text-zinc-700">© 2026 BeeNoo Company</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* relative — 알림 오버레이 패널이 본문 영역만 absolute로 덮도록 (미니바는 외부) */}
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            {/* Center panel — 페이지가 직접 렌더 */}
            <div
              className={
                songOverlayOpen
                  ? 'flex-1 flex flex-col overflow-hidden'
                  : isCreate
                    ? 'overflow-y-auto w-full md:w-[560px] md:shrink-0 md:border-r md:border-white/[0.06]'
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

            {/* notifications §5.1 — 데스크톱 오버레이 알림 패널 (본문 좌측 영역 덮음, 미니바 영향 X) */}
            {notifPanelOpen && (
              <div className="hidden md:block">
                <NotificationPanel mode="overlay" onClose={() => setNotifPanelOpen(false)} />
              </div>
            )}
          </div>

          {/* Global Mini Player */}
          <GlobalMiniBar />
        </main>

      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav />

      {/* 곡 생성 완료/실패 realtime 구독 (로그인 시) */}
      {user && <SongRealtimeBridge />}

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
