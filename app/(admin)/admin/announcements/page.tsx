// Design Ref: Module 7 — 공지 송출 (준비 중)
// 공지 콘텐츠를 노출할 랜딩 페이지 (/announcements/[id])가 먼저 필요. 페이지 생기면 같이 구현.

import { AdminPanel } from '@/components/admin/AdminPanel'

export const metadata = { title: '공지 송출 — MONO Admin' }

export default function AdminAnnouncementsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">공지</h1>
        <p className="text-sm text-zinc-500 mt-1">사용자에게 시스템 알림 일괄 발송</p>
      </header>

      <AdminPanel>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-700 text-xl mb-4">
            🛠
          </div>
          <p className="text-base font-semibold text-zinc-900">준비 중</p>
          <p className="text-sm text-zinc-500 mt-2 max-w-lg mx-auto leading-relaxed break-keep">
            공지를 알림으로 보내려면 사용자가 클릭했을 때 도착할 <span className="text-zinc-700 font-medium">공지 랜딩 페이지</span>가 먼저 필요해요.
            <br />랜딩 페이지 구현 후 이 모듈을 활성화합니다.
          </p>
          <p className="text-xs text-zinc-400 mt-4">
            지금은 Supabase SQL로 임시 발송 가능: <code className="text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">INSERT INTO notifications ...</code>
          </p>
        </div>
      </AdminPanel>
    </div>
  )
}
