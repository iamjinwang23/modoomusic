'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { notificationService } from '@/services/notification.service'

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
  const [unread, setUnread] = useState(0)

  // notifications §5.5 — 미읽음 점 배지
  useEffect(() => {
    if (!user) { setUnread(0); return }
    let cancelled = false
    async function load() {
      const n = await notificationService.unreadCount()
      if (!cancelled) setUnread(n)
    }
    load()
    function onChanged() { load() }
    window.addEventListener('notifications-changed', onChanged)
    return () => { cancelled = true; window.removeEventListener('notifications-changed', onChanged) }
  }, [user])

  // 프로필 탭 href — 로그인 + username 있을 때만 실제 프로필. 없으면 # + open-login
  const profileHref = profile?.username ? `/profile/${profile.username}` : '#'

  const items: NavItem[] = [
    { href: '/',              label: '둘러보기',   icon: '/Publish.svg' },
    { href: '/library',       label: '라이브러리', icon: '/Music-Library.svg' },
    { href: '/create',        label: '만들기',     icon: '/Ai-Generate-Music.svg' },
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
            <div className="relative">
              <Image
                src={it.icon}
                alt=""
                width={22}
                height={22}
                style={{ filter: active ? VIOLET_FILTER : 'invert(0.45)' }}
              />
              {it.label === '알림' && unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
              )}
            </div>
            <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-zinc-500'}`}>
              {it.label}
            </span>
          </Comp>
        )
      })}
    </nav>
  )
}
