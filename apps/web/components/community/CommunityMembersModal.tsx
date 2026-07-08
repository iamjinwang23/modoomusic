'use client'
// 멤버 목록 모달 — 멤버 스택 클릭 시. 비매니저: 단순 읽기전용 목록. 매니저: 탭형 관리(강퇴·차단 해제).
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import type { CommunityMember, CommunityBlockedUser } from '@mono/shared'

function Avatar({ name, hue, url, size = 36 }: { name: string | null; hue: number | null; url: string | null; size?: number }) {
  const c = profileColor(hue ?? 0)
  if (url) return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  return <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: size, height: size, background: c.bg, color: c.text, fontSize: size * 0.42 }}>{(name ?? '?').slice(0, 1).toUpperCase()}</div>
}

export function CommunityMembersModal({ members, managerId, communityId, isManager, onClose, onChanged }: {
  members: CommunityMember[]
  managerId: string
  communityId?: string
  isManager?: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const sorted = [...members].sort((a, b) => (a.userId === managerId ? -1 : b.userId === managerId ? 1 : 0))

  const [tab, setTab] = useState<'members' | 'blocked'>('members')
  const [blocks, setBlocks] = useState<CommunityBlockedUser[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [manageId, setManageId] = useState<string | null>(null)

  // 차단 탭 최초 진입 시 lazy fetch
  useEffect(() => {
    if (tab === 'blocked' && blocks === null && communityId) {
      fetch(`/api/communities/${communityId}/blocks`)
        .then(r => r.ok ? r.json() : { blocks: [] })
        .then(j => setBlocks(j.blocks ?? []))
        .catch(() => setBlocks([]))
    }
  }, [tab, blocks, communityId])

  function goProfile(username: string | null) {
    if (username) window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))
    onClose()
  }

  async function kick(userId: string, ban: boolean) {
    setBusy(true)
    const res = await fetch(`/api/communities/${communityId}/kick`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, ban }),
    })
    setBusy(false)
    setManageId(null)
    if (res.ok) { toast.success(ban ? '내보내고 차단했어요' : '내보냈어요'); onChanged?.(); onClose() }
    else toast.error('처리에 실패했어요')
  }

  async function unblock(userId: string) {
    setBusy(true)
    const res = await fetch(`/api/communities/${communityId}/unblock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
    })
    setBusy(false)
    if (res.ok) { toast.success('차단을 해제했어요'); setBlocks(prev => prev?.filter(b => b.userId !== userId) ?? null); onChanged?.() }
    else toast.error('해제에 실패했어요')
  }

  if (typeof document === 'undefined') return null

  // 비매니저: 기존 읽기전용 목록 그대로.
  if (!isManager) {
    return createPortal(
      <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-6">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-[#181B22] border border-white/[0.10] rounded-t-2xl md:rounded-2xl w-full max-w-full md:max-w-[420px] max-h-[80vh] flex flex-col shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-base font-semibold text-white">멤버 {members.length}</h2>
            <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
              <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {sorted.map((m) => (
              <button key={m.userId} onClick={() => goProfile(m.username)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors text-left">
                <Avatar name={m.displayName ?? m.username} hue={m.avatarHue} url={m.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{m.displayName ?? m.username ?? '익명'}</p>
                  {m.username && <p className="text-[11px] text-zinc-500 truncate">@{m.username}</p>}
                </div>
                {m.userId === managerId && <span className="shrink-0 text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full">매니저</span>}
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // 매니저: 탭형 관리 모달.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#181B22] border border-white/[0.10] rounded-t-2xl md:rounded-2xl w-full max-w-full md:max-w-[420px] max-h-[80vh] flex flex-col shadow-2xl" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">{tab === 'members' ? `멤버 ${members.length}` : `차단 ${blocks?.length ?? 0}`}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>
        {/* 탭 */}
        <div className="flex gap-1 px-3 pt-2.5 border-b border-white/[0.06]">
          <button onClick={() => { setTab('members'); setManageId(null) }} className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${tab === 'members' ? 'text-white border-violet-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
            멤버 {members.length}
          </button>
          <button onClick={() => setTab('blocked')} className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${tab === 'blocked' ? 'text-white border-violet-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
            차단 {blocks?.length ?? 0}
          </button>
        </div>

        {tab === 'members' ? (
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {sorted.map((m) => {
              const isMgr = m.userId === managerId
              return (
                <div key={m.userId} className="flex items-center gap-2 pr-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                  <button onClick={() => goProfile(m.username)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left">
                    <Avatar name={m.displayName ?? m.username} hue={m.avatarHue} url={m.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{m.displayName ?? m.username ?? '익명'}</p>
                      {m.username && <p className="text-[11px] text-zinc-500 truncate">@{m.username}</p>}
                    </div>
                    {isMgr && <span className="shrink-0 text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full">매니저</span>}
                  </button>
                  {!isMgr && (
                    <div className="relative shrink-0">
                      {manageId === m.userId ? (
                        <div className="flex gap-1.5">
                          <button disabled={busy} onClick={() => kick(m.userId, false)} className="px-2.5 py-1.5 rounded-full text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12] transition disabled:opacity-40">강퇴</button>
                          <button disabled={busy} onClick={() => kick(m.userId, true)} className="px-2.5 py-1.5 rounded-full text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 transition disabled:opacity-40">강퇴 후 차단</button>
                          <button disabled={busy} onClick={() => setManageId(null)} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors disabled:opacity-40" aria-label="취소">
                            <Image src="/Close-Fill.svg" alt="취소" width={11} height={11} style={{ filter: 'invert(0.5)' }} />
                          </button>
                        </div>
                      ) : (
                        <button disabled={busy} onClick={() => setManageId(m.userId)} className="w-8 h-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-white transition-colors disabled:opacity-40" aria-label="관리">
                          <span className="text-lg leading-none">⋯</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {blocks === null ? (
              <p className="text-sm text-zinc-500 py-10 text-center">불러오는 중…</p>
            ) : blocks.length === 0 ? (
              <p className="text-sm text-zinc-500 py-10 text-center">차단한 사용자가 없어요.</p>
            ) : blocks.map((b) => (
              <div key={b.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors">
                <Avatar name={b.displayName ?? b.username} hue={b.avatarHue} url={b.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{b.displayName ?? b.username ?? '익명'}</p>
                  {b.username && <p className="text-[11px] text-zinc-500 truncate">@{b.username}</p>}
                </div>
                <button disabled={busy} onClick={() => unblock(b.userId)} className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12] transition disabled:opacity-40">차단 해제</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
