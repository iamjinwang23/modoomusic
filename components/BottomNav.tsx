'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { toast } from '@/components/toast/toast'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

interface NavItem { href: string; label: string; icon: string; matchPrefix?: string; comingSoon?: boolean }

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/'
  const prefix = item.matchPrefix ?? item.href
  return pathname === item.href || pathname.startsWith(prefix + '/') || pathname === prefix
}

export function BottomNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()

  const profileHref = profile?.username ? `/profile/${profile.username}` : '#'

  const items: NavItem[] = [
    { href: '/',           label: '둘러보기',   icon: '/Publish.svg' },
    { href: '/community',  label: '커뮤니티',   icon: '/chat.svg', matchPrefix: '/community', comingSoon: true },
    { href: '/create',     label: '만들기',     icon: '/Ai-Generate-Music.svg' },
    { href: '/library',    label: '라이브러리', icon: '/Music-Library.svg' },
    { href: profileHref,   label: '프로필',     icon: '/Profile.svg', matchPrefix: '/profile' },
  ]

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111318]/95 backdrop-blur border-t border-white/[0.06] grid grid-cols-5"
      style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
    >
      {items.map((it) => {
        const active = isActive(pathname, it)
        const comingSoon = !!it.comingSoon && process.env.NODE_ENV !== 'development'
        const requireLogin = it.label === '프로필' && !user
        const Comp: any = (comingSoon || requireLogin) ? 'button' : Link
        const linkProps = comingSoon
          ? { onClick: () => toast.info('커뮤니티는 곧 오픈해요') }
          : requireLogin
            ? { onClick: () => window.dispatchEvent(new Event('open-login')) }
            : { href: it.href }
        return (
          <Comp
            key={it.label}
            {...linkProps}
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 transition-colors"
          >
            <div className="relative">
              <Image
                src={it.icon}
                alt=""
                width={26}
                height={26}
                style={{ filter: active ? VIOLET_FILTER : 'invert(0.45)' }}
              />
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
