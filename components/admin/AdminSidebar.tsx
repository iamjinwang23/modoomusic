'use client'

// Design Ref: §5.1 Sidebar — 좌측 200px 고정, 모듈별 항목, 활성 표시.
// 권한별 필터링: permissions=null이면 모두, 배열이면 그 모듈만 노출.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { hasPermission, type AdminModule } from '@/lib/admin/modules'

interface NavItem {
  href: string
  label: string
  exact?: boolean
  permission?: AdminModule  // 없으면 누구나 (대시보드)
}
interface NavGroup { header?: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/admin', label: '대시보드', exact: true },  // permission 없음 = 모든 관리자
    ],
  },
  {
    header: '운영',
    items: [
      { href: '/admin/users',    label: '사용자', permission: 'users' },
      { href: '/admin/content',  label: '콘텐츠', permission: 'content' },
      { href: '/admin/credits',  label: '크레딧', permission: 'credits' },
      { href: '/admin/reports',  label: '신고',   permission: 'reports' },
    ],
  },
  {
    header: '시스템',
    items: [
      { href: '/admin/announcements', label: '공지',     permission: 'announcements' },
      { href: '/admin/models',        label: '모델',     permission: 'models' },
      { href: '/admin/audit',         label: '감사 로그', permission: 'audit' },
    ],
  },
]

export function AdminSidebar({ permissions }: { permissions: string[] | null }) {
  const pathname = usePathname()

  // 권한 기반 필터링 후 빈 그룹은 헤더도 안 보이게.
  const filteredGroups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((it) => !it.permission || hasPermission(permissions, it.permission)),
  })).filter((g) => g.items.length > 0)

  return (
    <aside className="w-[200px] shrink-0 border-r border-zinc-200 bg-white overflow-y-auto">
      <nav className="py-3 px-2 space-y-4">
        {filteredGroups.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.header && (
              <p className="px-3 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                {group.header}
              </p>
            )}
            {group.items.map((item) => {
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
          </div>
        ))}
      </nav>
    </aside>
  )
}
