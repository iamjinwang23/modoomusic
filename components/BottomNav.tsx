'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

interface NavItem { href: string; label: string; icon: string; matchPrefix?: string }

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/'
  const prefix = item.matchPrefix ?? item.href
  return pathname === item.href || pathname.startsWith(prefix + '/') || pathname === prefix
}

export function BottomNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()

  // 프로필 탭 href — 로그인 + username 있을 때만 실제 프로필. 없으면 # + open-login
  const profileHref = profile?.username ? `/profile/${profile.username}` : '#'

  const items: NavItem[] = [
    { href: '/explore',       label: '탐색',      icon: '/Compass.svg' },
    { href: '/library',       label: '라이브러리', icon: '/Music-Library.svg' },
    { href: '/',              label: '만들기',     icon: '/Music-Create.svg' },
    { href: '/notifications', label: '알림',      icon: '/Notification.svg' },
    { href: profileHref,      label: '프로필',     icon: '/Profile.svg', matchPrefix: '/profile' },
  ]

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111318]/95 backdrop-blur border-t border-white/[0.06] grid grid-cols-5"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
    >
      {items.map((it) => {
        const active = isActive(pathname, it)
        const requireLogin = it.label === '프로필' && !user
        const Comp: any = requireLogin ? 'button' : Link
        const linkProps = requireLogin
          ? { onClick: () => window.dispatchEvent(new Event('open-login')) }
          : { href: it.href }
        return (
          <Comp
            key={it.label}
            {...linkProps}
            className="flex flex-col items-center justify-center gap-1 py-2 transition-colors"
          >
            <Image
              src={it.icon}
              alt=""
              width={22}
              height={22}
              style={{ filter: active ? VIOLET_FILTER : 'invert(0.45)' }}
            />
            <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-zinc-500'}`}>
              {it.label}
            </span>
          </Comp>
        )
      })}
    </nav>
  )
}
