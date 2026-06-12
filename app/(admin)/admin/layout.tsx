// Design Ref: §5.1 Screen Layout, §7 Security — 라이트 모드 wrapper + 3중 가드 중 layout 가드.
// Plan SC: (3) 비관리자 접근 시 redirect. 데스크톱 전용 (모바일 미지원).

import { requireAdminOrRedirect } from '@/lib/admin/guard'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'MONO Admin',
  // 검색엔진·소셜에 노출 방지
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Design Ref: §7 — server-side is_admin 가드. 통과 못하면 redirect('/')
  await requireAdminOrRedirect()

  return (
    // 본체(다크) 글로벌 스타일을 명시 클래스로 덮어씀.
    // Design Ref: §10.4 라이트 모드 토큰 — 페이지 단위 명시
    <div className="min-h-screen bg-zinc-50 text-zinc-900" data-theme="admin">
      <header className="h-12 bg-white border-b border-zinc-200 flex items-center px-5 sticky top-0 z-30">
        <Link href="/admin" className="flex items-center gap-2">
          {/* 라이트 모드라 원본 검정 로고 그대로 사용 (invert 미적용) */}
          <Image src="/logo.svg" alt="모두의 노래" width={72} height={16} priority />
          <span className="text-xs font-medium text-zinc-400">admin</span>
        </Link>
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 transition-colors">서비스로 돌아가기</Link>
        </div>
      </header>

      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 min-w-0 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
