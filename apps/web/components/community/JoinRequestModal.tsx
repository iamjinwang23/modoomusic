// 비공개 가입 신청 — 수칙 표시 + 신청. createPortal 패턴(CreateCommunityModal 참고).
'use client'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import { toast } from '@/components/toast/toast'

export function JoinRequestModal({ communityId, communityName, joinRules, onClose, onRequested }: {
  communityId: string
  communityName: string
  joinRules: string | null
  onClose: () => void
  onRequested: () => void
}) {
  const [busy, setBusy] = useState(false)
  if (typeof document === 'undefined') return null

  async function submit() {
    if (busy) return
    setBusy(true)
    const res = await fetch(`/api/communities/${communityId}/join`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) { toast.success('가입을 신청했어요'); onRequested(); onClose(); return }
    toast.error(j.error === 'blocked' ? '이 커뮤니티에 가입할 수 없어요' : j.error === 'rejoin_cooldown' ? '아직 재신청할 수 없어요' : '신청에 실패했어요')
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl w-full max-w-[420px] p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-white">{communityName} 가입 신청</h2>
        <p className="mt-1 text-xs text-zinc-400">매니저 승인 후 가입돼요.</p>
        {joinRules && (
          <div className="mt-4 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-[11px] font-medium text-zinc-400 mb-1">가입 수칙</p>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{joinRules}</p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={busy ? undefined : onClose} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition disabled:opacity-40">취소</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition active:scale-[0.98] disabled:opacity-40">{busy ? '신청 중…' : '가입 신청'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
