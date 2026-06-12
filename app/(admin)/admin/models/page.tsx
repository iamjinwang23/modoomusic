// Design Ref: Module 8 — 모델 운영 (준비 중)
// 현재는 services/minimax.service.ts에 MODELS 상수로 하드코딩. DB로 옮기는 작업이 선행되어야 함.

import { AdminPanel } from '@/components/admin/AdminPanel'

export const metadata = { title: '모델 운영 — MONO Admin' }

export default function AdminModelsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">모델</h1>
        <p className="text-sm text-zinc-500 mt-1">AI 모델 단가·잠금 상태 토글</p>
      </header>

      <AdminPanel>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 text-amber-700 text-xl mb-4">
            🛠
          </div>
          <p className="text-base font-semibold text-zinc-900">준비 중</p>
          <p className="text-sm text-zinc-500 mt-2 max-w-lg mx-auto leading-relaxed break-keep">
            현재 모델 정의는 <span className="text-zinc-700 font-medium">services/minimax.service.ts</span>의 상수로 관리 중이에요.
            <br />DB 테이블로 이전 후 이 모듈에서 단가·잠금 토글이 가능해집니다.
          </p>
          <p className="text-xs text-zinc-400 mt-4">
            지금은 코드 수정 + 배포로 모델 정책 변경 가능
          </p>
        </div>
      </AdminPanel>
    </div>
  )
}
