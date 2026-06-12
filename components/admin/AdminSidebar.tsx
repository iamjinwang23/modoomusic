'use client'

// Design Ref: §5.1 Sidebar — 좌측 200px 고정, 모듈별 항목, 활성 표시.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem { href: string; label: string; exact?: boolean }

const ITEMS: NavItem[] = [
  { href: '/admin',                label: '대시보드',   exact: true },
  { href: '/admin/credits',        label: '크레딧 지급' },
  { href: '/admin/reports',        label: '신고 처리' },
  { href: '/admin/users',          label: '사용자 관리' },
  { href: '/admin/content',        label: '콘텐츠' },
  { href: '/admin/announcements',  label: '공지' },
  { href: '/admin/models',         label: '모델' },
  { href: '/admin/audit',          label: '감사 로그' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[200px] shrink-0 border-r border-zinc-200 bg-white min-h-[calc(100vh-48px)] sticky top-12">
      <nav className="py-3 px-2 space-y-0.5">
        {ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-violet-50 text-violet-700 font-semibold'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
