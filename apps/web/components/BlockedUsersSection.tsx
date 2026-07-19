// 차단 목록 관리 — 내가 차단한 사용자 목록 조회 · 차단 해제
'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { profileColor } from '@/utils/profileColor'
import { toast } from '@/components/toast/toast'

interface BlockedUser {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  avatar_hue: number | null
}

export function BlockedUsersSection() {
  const [users, setUsers] = useState<BlockedUser[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/users/blocked')
      if (!res.ok) { setUsers([]); return }
      const json = await res.json()
      setUsers(json.blocked ?? [])
    } catch {
      setUsers([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function unblock(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/users/${id}/block`, { method: 'DELETE' })
      if (!res.ok) { toast.error('차단 해제에 실패했어요'); return }
      setUsers((prev) => (prev ?? []).filter((u) => u.id !== id))
      toast.success('차단을 해제했어요')
    } catch {
      toast.error('차단 해제에 실패했어요')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-400">차단한 사용자</h2>
      {users === null ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 rounded-xl bg-white/[0.04] shimmer" />)}</div>
      ) : users.length === 0 ? (
        <p className="text-sm text-zinc-500 py-8 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">차단한 사용자가 없어요.</p>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.06] overflow-hidden">
          {users.map((u) => {
            const name = u.display_name || u.username || '사용자'
            const c = profileColor(u.avatar_hue)
            return (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                {u.avatar_url ? (
                  <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0">
                    <Image src={u.avatar_url} alt={name} fill className="object-cover" sizes="36px" unoptimized />
                    <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/[0.08]" />
                  </div>
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: c.bg, color: c.text }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{name}</p>
                  {u.username && <p className="text-[11px] text-zinc-500 truncate">@{u.username}</p>}
                </div>
                <button
                  onClick={() => unblock(u.id)}
                  disabled={busyId === u.id}
                  className="shrink-0 text-[13px] font-semibold text-zinc-300 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition active:scale-[0.96] disabled:opacity-40"
                >
                  {busyId === u.id ? '해제 중…' : '차단 해제'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
