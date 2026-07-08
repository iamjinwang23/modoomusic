// 매니저 심사 — pending 승인/거절(사유). 차단 목록/해제 탭은 후속 작업(미구현).
'use client'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import type { CommunityJoinRequest } from '@mono/shared'

function Avatar({ name, hue, url }: { name: string | null; hue: number | null; url: string | null }) {
  const c = profileColor(hue ?? 0)
  if (url) return <img src={url} alt="" width={36} height={36} className="rounded-full object-cover shrink-0" style={{ width: 36, height: 36 }} />
  return <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: 36, height: 36, background: c.bg, color: c.text, fontSize: 15 }}>{(name ?? '?').slice(0, 1).toUpperCase()}</div>
}

export function ManageJoinRequestsModal({ communityId, onClose, onChanged }: {
  communityId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [requests, setRequests] = useState<CommunityJoinRequest[] | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/communities/${communityId}/join-requests`).then(r => r.ok ? r.json() : { requests: [] }).then(j => setRequests(j.requests ?? []))
  }, [communityId])

  async function decide(userId: string, action: 'approve' | 'reject', rsn?: string) {
    setBusy(true)
    const res = await fetch(`/api/communities/${communityId}/join-requests/${userId}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: rsn }),
    })
    setBusy(false)
    if (!res.ok) { toast.error('처리에 실패했어요'); return }
    toast.success(action === 'approve' ? '가입을 수락했어요' : '가입을 거절했어요')
    setRequests(prev => prev?.filter(r => r.userId !== userId) ?? null)
    setRejecting(null); setReason('')
    onChanged()
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full h-full md:h-auto md:max-w-[440px] md:max-h-[80vh] bg-[#181B22] md:border border-white/[0.10] md:rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">가입 신청</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {requests === null ? (
            <p className="text-sm text-zinc-500 py-10 text-center">불러오는 중…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-zinc-500 py-10 text-center">대기 중인 신청이 없어요.</p>
          ) : requests.map(r => (
            <div key={r.userId} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Avatar name={r.displayName ?? r.username} hue={r.avatarHue} url={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{r.displayName ?? r.username ?? '익명'}</p>
                  {r.username && <p className="text-xs text-zinc-500 truncate">@{r.username}</p>}
                </div>
                {rejecting !== r.userId && (
                  <div className="flex gap-2 shrink-0">
                    <button disabled={busy} onClick={() => decide(r.userId, 'approve')} className="px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-40">수락</button>
                    <button disabled={busy} onClick={() => setRejecting(r.userId)} className="px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 bg-white/[0.06] hover:bg-white/[0.12] transition disabled:opacity-40">거절</button>
                  </div>
                )}
              </div>
              {rejecting === r.userId && (
                <div className="mt-2.5 flex gap-2">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="거절 사유(선택)"
                    className="flex-1 bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                  <button disabled={busy} onClick={() => decide(r.userId, 'reject', reason.trim() || undefined)} className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 transition disabled:opacity-40">거절하기</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
