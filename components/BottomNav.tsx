'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

const ITEMS: { href: string; label: string; icon: string }[] = [
  { href: '/',              label: '만들기',     icon: '/Music-Create.svg' },
  { href: '/library',       label: '라이브러리', icon: '/Music-Library.svg' },
  { href: '/explore',       label: '탐색',      icon: '/Compass.svg' },
  { href: '/notifications', label: '알림',      icon: '/Notification.svg' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111318]/95 backdrop-blur border-t border-white/[0.06] grid grid-cols-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {ITEMS.map(({ href, label, icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center gap-1 py-2 transition-colors"
          >
            <Image
              src={icon}
              alt=""
              width={22}
              height={22}
              style={{ filter: active ? VIOLET_FILTER : 'invert(0.45)' }}
            />
            <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-zinc-500'}`}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
