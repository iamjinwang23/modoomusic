'use client'
// 멤버 목록 모달 — 멤버 스택 클릭 시. 매니저 상단·칩 표기.
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { profileColor } from '@/utils/profileColor'
import type { CommunityMember } from '@mono/shared'

function Avatar({ name, hue, url, size = 36 }: { name: string | null; hue: number | null; url: string | null; size?: number }) {
  const c = profileColor(hue ?? 0)
  if (url) return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  return <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: size, height: size, background: c.bg, color: c.text, fontSize: size * 0.42 }}>{(name ?? '?').slice(0, 1).toUpperCase()}</div>
}

export function CommunityMembersModal({ members, managerId, onClose }: {
  members: CommunityMember[]
  managerId: string
  onClose: () => void
}) {
  const sorted = [...members].sort((a, b) => (a.userId === managerId ? -1 : b.userId === managerId ? 1 : 0))

  function goProfile(username: string | null) {
    if (username) window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))
    onClose()
  }

  if (typeof document === 'undefined') return null
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
