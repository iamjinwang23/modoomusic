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
import { VideoCoverPoller } from '@/components/VideoCoverPoller'
import { NotificationRealtimeBridge } from '@/components/NotificationRealtimeBridge'
import { GlobalMiniBar } from '@/components/GlobalMiniBar'
import { BottomNav } from '@/components/BottomNav'
import { NotificationPanel } from '@/components/NotificationPanel'
import { ReferralModal } from '@/components/ReferralModal'
import { PopupAnnouncementCard } from '@/components/PopupAnnouncementCard'
import { CreditPurchaseModal } from '@/components/CreditPurchaseModal'
import { useAuth } from '@/components/AuthProvider'
import { notificationService } from '@/services/notification.service'

import { profileColor } from '@/utils/profileColor'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

const NAV_ITEMS: { href: string; label: string; icon: string }[] = [
  { href: '/',              label: '둘러보기',    icon: '/Publish.svg' },
  { href: '/community',     label: '커뮤니티',    icon: '/chat.svg' },
  { href: '/create',        label: '음악 만들기', icon: '/Ai-Generate-Music.svg' },
  { href: '/library',       label: '라이브러리',   icon: '/Music-Library.svg' },
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
  const [legalMenuOpen, setLegalMenuOpen] = useState(false)
  const [referralOpen, setReferralOpen] = useState(false)
  const [creditPurchaseOpen, setCreditPurchaseOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [comingSoon, setComingSoon] = useState<null | 'sidebar' | 'locked-model' | 'daily-limit'>(null)
  const [songOverlayOpen, setSongOverlayOpen] = useState(false)
  // notifications §5.1 — 데스크톱 오버레이 패널 + 미읽음 점 배지
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [notifUnread, setNotifUnread] = useState(0)
  // 프로필 메뉴 상단에 표시할 보유 크레딧 (CreditIndicator와 동일 소스)
  const [credits, setCredits] = useState<number | null>(null)

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

  // 보유 크레딧 — 로그인 시 1회 조회 + credits-updated 이벤트로 동기화
  useEffect(() => {
    if (!user) { setCredits(null); return }
    let cancelled = false
    const toTotal = (s: { total?: number; remaining?: number; bonus?: number }) => s.total ?? ((s.remaining ?? 0) + (s.bonus ?? 0))
    fetch('/api/credits/me').then((r) => r.ok ? r.json() : null).then((d) => { if (!cancelled && d) setCredits(toTotal(d)) })
    function onUpd(e: Event) { const s = (e as CustomEvent).detail; if (s) setCredits(toTotal(s)) }
    window.addEventListener('credits-updated', onUpd)
    return () => { cancelled = true; window.removeEventListener('credits-updated', onUpd) }
  }, [user?.id])

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
    function onOpenCreditPurchase() { setCreditPurchaseOpen(true) }
    window.addEventListener('view-profile', onViewProfile)
    window.addEventListener('view-song', onViewSong)
    window.addEventListener('open-login', onOpenLogin)
    window.addEventListener('open-coming-soon', onComingSoon)
    window.addEventListener('open-credit-purchase', onOpenCreditPurchase)
    return () => {
      window.removeEventListener('view-profile', onViewProfile)
      window.removeEventListener('view-song', onViewSong)
      window.removeEventListener('open-login', onOpenLogin)
      window.removeEventListener('open-coming-soon', onComingSoon)
      window.removeEventListener('open-credit-purchase', onOpenCreditPurchase)
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
      exploreService.getShareSongById(songId).then((pub) => {
        if (!pub) return
        window.dispatchEvent(new CustomEvent('view-song', {
          detail: {
            feed: [{
              id: pub.id, createdAt: pub.createdAt, title: pub.title, prompt: pub.prompt,
              genre: pub.genre, mood: pub.mood, customLyrics: null, lyrics: pub.lyrics,
              instrumental: pub.instrumental, audioUrl: pub.audioUrl, duration: pub.duration ?? null,
              liked: pub.isLiked, coverHue: pub.coverHue, coverImage: pub.coverImage,
              model: pub.model,
              videoCoverUrl: pub.videoCoverUrl,
              videoCoverStatus: pub.videoCoverStatus,
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

  const isCreate = pathname === '/create'

  const headerInitial = (profile?.displayName ?? user?.user_metadata?.full_name ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  // 프로필 아바타 색상 — profile.avatarHue 기반 (DB 저장값)으로 통일.
  // profile 로드 전엔 fallback (user.id 첫 글자)으로 색 유지.
  const fallbackHue = user ? user.id.charCodeAt(0) * 137 : 0
  const avatarBg = profileColor(profile?.avatarHue ?? fallbackHue)

  return (
    <div
      className="flex flex-col bg-[#111318] text-white overflow-hidden select-none h-[calc(100dvh-68px-env(safe-area-inset-bottom,0px))] md:h-screen"
    >

      {/* ── Header — 모바일 전용 (데스크톱은 사이드바에 로고·프로필·크레딧 통합) ── */}
      <header className="relative shrink-0 h-14 flex items-center px-5 border-b border-white/[0.06] bg-[#111318] z-50 md:hidden">
        <Link href="/">
          <Image src="/logo.svg" alt="모두의 노래" width={81} height={18} style={{ filter: 'invert(1)' }} />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {pathname === '/notifications' ? (
            <button onClick={() => router.back()} className="relative w-8 h-8 flex items-center justify-center active:scale-95 transition">
              <Image src="/Close-Fill.svg" alt="닫기" width={24} height={24} style={{ filter: 'invert(0.6)' }} />
            </button>
          ) : (
            <Link href="/notifications" className="relative w-8 h-8 flex items-center justify-center active:scale-95 transition">
              <Image src="/Notification.svg" alt="알림" width={24} height={24} style={{ filter: 'invert(0.6)' }} />
              {notifUnread > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />
              )}
            </Link>
          )}
          {!user && (
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
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#111318]">
          {/* 로고 — 우측 검색바(py-6 안 h-11)와 세로 중심 정렬 */}
          <div className="px-4 pt-6 pb-1">
            <Link href="/" className="inline-flex items-center h-11">
              <Image src="/logo.svg" alt="모두의 노래" width={99} height={22} style={{ filter: 'invert(1)' }} />
            </Link>
          </div>

          {/* 프로필 / 로그인 — 클릭 시 메뉴 레이어 */}
          <div className="px-3 pt-2 pb-1">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
                >
                  <span
                    className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold shrink-0"
                    style={profile?.avatarUrl ? undefined : { background: avatarBg.bg, color: avatarBg.text }}
                  >
                    {profile?.avatarUrl ? (
                      <Image src={profile.avatarUrl} alt="" width={36} height={36} className="object-cover w-full h-full" unoptimized />
                    ) : headerInitial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white truncate">{profile?.displayName ?? user.user_metadata?.full_name ?? '사용자'}</span>
                    <span className="block text-[11px] text-zinc-500 truncate">{user.email}</span>
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 shrink-0">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[54]" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute left-10 top-full mt-1 z-[55] w-56 bg-[#21252E] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
                      {/* 크레딧 표시(짙은 회색 프레임) + 충전 + 플랜 업그레이드 */}
                      <div className="px-3 pt-3 pb-3 space-y-2 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between px-3 py-3 rounded-lg bg-[#2C313D]">
                          <span className="flex items-center gap-1.5 text-sm text-white">
                            <Image src="/Sparkles.svg" alt="" width={15} height={15} style={{ filter: 'invert(1)' }} />
                            크레딧
                          </span>
                          <span className="text-sm font-semibold text-white tabular-nums">{credits ?? '—'}</span>
                        </div>
                        <button
                          onClick={() => { setUserMenuOpen(false); window.dispatchEvent(new Event('open-credit-purchase')) }}
                          className="w-full py-3 rounded-lg bg-white hover:bg-zinc-100 text-zinc-900 text-sm font-semibold transition active:scale-[0.98]"
                        >
                          크레딧 충전하기
                        </button>
                        <button
                          onClick={() => { setUserMenuOpen(false); setComingSoon('sidebar') }}
                          className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition active:scale-[0.98]"
                        >
                          플랜 업그레이드
                        </button>
                        <p className="text-center text-[11px] text-zinc-500">업그레이드 시 추가 크레딧 제공</p>
                      </div>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          const username = profile?.username ?? user.user_metadata?.username ?? user.email?.split('@')[0] ?? user.id.slice(0, 8)
                          router.push(`/profile/${username}`)
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/[0.04] transition-colors"
                      >
                        내 프로필
                      </button>
                      <button
                        onClick={() => { setUserMenuOpen(false); router.push('/account') }}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/[0.04] transition-colors"
                      >
                        내 계정
                      </button>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          window.dispatchEvent(new Event('song-updated'))
                          window.dispatchEvent(new Event('collection-updated'))
                          router.push('/')
                          signOut()
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
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
                className="w-full text-sm text-white border border-white/25 hover:border-white/40 px-3 py-2 rounded-full hover:bg-white/[0.08] transition-colors"
              >
                로그인
              </button>
            )}
          </div>

          <nav className="flex-1 px-3 pt-2 pb-3 space-y-0.5">
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
            {/* 혜택 — 친구 초대 (Phase 2: 출석·미션 추가 예정) */}
            {user ? (
              <button
                onClick={() => setReferralOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base text-white hover:bg-white/[0.04] transition-colors"
              >
                <Image src="/Gift-Card.svg" alt="" width={18} height={18} style={{ filter: 'invert(0.4)' }} />
                혜택
                <span className="ml-auto text-[10px] font-medium px-1.5 py-1 rounded-md bg-[#3aabed]/20 text-[#7dc8f1] leading-none">친구 초대</span>
              </button>
            ) : (
              <button
                onClick={() => window.dispatchEvent(new Event('open-login'))}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                <Image src="/Gift-Card.svg" alt="" width={18} height={18} style={{ filter: 'invert(0.4)' }} />
                혜택
                <span className="ml-auto text-[10px] font-medium px-1.5 py-1 rounded-md bg-[#3aabed]/20 text-[#7dc8f1] leading-none">친구 초대</span>
              </button>
            )}
          </nav>
          <div className="p-3 space-y-2">
            {/* 더보기 — 클릭 시 위로 팝업 */}
            <div className="relative">
              <button
                onClick={() => setLegalMenuOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-base text-white hover:bg-white/[0.04] transition-colors"
              >
                <Image src="/More-3.svg" alt="" width={18} height={18} style={{ filter: 'invert(0.4)' }} />
                더보기
              </button>
              {legalMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[54]" onClick={() => setLegalMenuOpen(false)} />
                  <div className="absolute bottom-full left-10 mb-2 z-[55] w-56 bg-[#21252E] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden py-1">
                    {/* What's New — 공지(앱 내부 이동) */}
                    <Link
                      href="/announcements"
                      onClick={() => setLegalMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors border-b border-white/[0.06]"
                    >
                      <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1) brightness(0.85)' }} />
                      공지사항
                    </Link>
                    {[
                      { href: '/terms', label: '이용약관', icon: '/terms.png' },
                      { href: '/privacy', label: '개인정보처리방침', icon: '/security-policy.png' },
                      { href: '/policy', label: '운영정책', icon: '/policy.png' },
                    ].map(({ href, label, icon }) => (
                      <Link
                        key={href}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setLegalMenuOpen(false)}
                        className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <Image src={icon} alt="" width={16} height={16} style={{ filter: 'invert(1) brightness(0.85)' }} />
                          {label}
                        </span>
                        <Image src="/External-Link.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4)' }} />
                      </Link>
                    ))}
                    <Link
                      href="/help"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setLegalMenuOpen(false)}
                      className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors border-t border-white/[0.06]"
                    >
                      <span className="flex items-center gap-2.5">
                        <Image src="/Help.png" alt="" width={16} height={16} style={{ filter: 'invert(1) brightness(0.85)' }} />
                        도움말
                      </span>
                      <Image src="/External-Link.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4)' }} />
                    </Link>
                    <Link
                      href="/faq"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setLegalMenuOpen(false)}
                      className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Image src="/faq.png" alt="" width={16} height={16} style={{ filter: 'invert(1) brightness(0.85)' }} />
                        자주 묻는 질문
                      </span>
                      <Image src="/External-Link.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4)' }} />
                    </Link>
                    <a
                      href="mailto:bee202408@gmail.com"
                      onClick={() => setLegalMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors"
                    >
                      <Image src="/costumer.png" alt="" width={16} height={16} style={{ filter: 'invert(1) brightness(0.85)' }} />
                      문의하기
                    </a>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-white/[0.06] pt-3">
              <p className="text-center text-[10px] text-zinc-700">© 2026 BeeNoo Company</p>
            </div>
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

          {/* referral §5.1 — 친구 초대 모달 */}
          <ReferralModal open={referralOpen} onClose={() => setReferralOpen(false)} />

          {/* Global Mini Player */}
          <GlobalMiniBar />
        </main>

      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav />

      {/* 우측 하단 팝업 공지 카드 (활성 팝업 있을 때만) */}
      <PopupAnnouncementCard />

      {/* 크레딧 충전 모달 */}
      <CreditPurchaseModal open={creditPurchaseOpen} onClose={() => setCreditPurchaseOpen(false)} />

      {/* 곡 생성 완료/실패 realtime 구독 (로그인 시) */}
      {user && <SongRealtimeBridge />}
      {user && <VideoCoverPoller />}

      {/* 알림 INSERT realtime 구독 — 배지 누락 race 방지 (로그인 시) */}
      {user && <NotificationRealtimeBridge />}

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
