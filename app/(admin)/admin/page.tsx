// Design Ref: §11 Implementation Guide — Module 1에서는 dashboard placeholder.
// 통계 모듈(Module 6)에서 실제 카드·차트 구현 예정.

import { AdminPanel } from '@/components/admin/AdminPanel'

export const metadata = { title: '대시보드 — MONO Admin' }

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">대시보드</h1>
        <p className="text-sm text-zinc-500 mt-1">운영 통계 요약 — 통계 모듈(Module 6)에서 구현 예정</p>
      </header>

      <AdminPanel title="환영합니다" description="좌측 메뉴에서 모듈을 선택하세요.">
        <div className="grid grid-cols-2 gap-4">
          <Card label="크레딧 지급" path="/admin/credits" desc="사용자에게 보너스 크레딧 지급/차감" />
          <Card label="신고 처리" path="/admin/reports" desc="곡·댓글 신고 큐와 처리" />
          <Card label="사용자 관리" path="/admin/users" desc="검색·정지·강제 탈퇴" />
          <Card label="감사 로그" path="/admin/audit" desc="모든 어드민 동작 기록 조회" />
        </div>
      </AdminPanel>
    </div>
  )
}

function Card({ label, path, desc }: { label: string; path: string; desc: string }) {
  return (
    <a
      href={path}
      className="block rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-white hover:border-violet-300 transition-colors p-4"
    >
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <p className="text-xs text-zinc-500 mt-1">{desc}</p>
    </a>
  )
}
