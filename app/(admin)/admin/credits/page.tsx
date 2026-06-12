'use client'

// Design Ref: §5.2 — 사용자 검색 → 결과 카드 → 지급 모달 → POST grant-credit
// Plan SC: (1) SQL 없이 크레딧 지급 (3) 사유 필수

import { useState, useEffect } from 'react'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { AdminConfirm } from '@/components/admin/AdminConfirm'

interface UserRow {
  id: string
  username: string
  displayName: string | null
  email: string | null
  bonusCredits: number
  suspendedAt: string | null
  isAdmin: boolean
  createdAt: string
}

export default function AdminCreditsPage() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<UserRow | null>(null)
  const [amount, setAmount] = useState<number>(10)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setUsers([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setUsers(data.data ?? [])
      } catch (e) {
        console.error('[search]', e)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  async function handleGrant(reason: string) {
    if (!target) return
    const res = await fetch('/api/admin/grant-credit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: target.id, amount, reason }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message ?? data.error ?? '처리 실패')
    }
    setFeedback({
      type: 'success',
      msg: `${data.data.username}: ${data.data.before}cr → ${data.data.after}cr (${data.data.amount > 0 ? '+' : ''}${data.data.amount})`,
    })
    // 목록의 해당 row 갱신
    setUsers((list) => list.map((u) =>
      u.id === target.id ? { ...u, bonusCredits: data.data.after } : u,
    ))
    setTarget(null)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">크레딧</h1>
        <p className="text-sm text-zinc-500 mt-1">사용자 검색 후 보너스 크레딧 지급 또는 차감 (모든 동작은 감사 로그에 기록됩니다)</p>
      </header>

      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.msg}
          <button onClick={() => setFeedback(null)} className="float-right text-zinc-400 hover:text-zinc-700">✕</button>
        </div>
      )}

      <AdminPanel title="사용자 검색" description="username 또는 email로 검색 (2자 이상)">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: na5892 또는 user@example.com"
          autoFocus
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors"
        />

        {loading && <p className="text-xs text-zinc-500 mt-3">검색 중…</p>}

        {!loading && users.length === 0 && query.trim().length >= 2 && (
          <p className="text-xs text-zinc-500 mt-3">결과가 없어요</p>
        )}

        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">
                  {u.username}
                  {u.isAdmin && <span className="ml-2 text-[10px] font-medium text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">admin</span>}
                  {u.suspendedAt && <span className="ml-2 text-[10px] font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">정지</span>}
                </p>
                <p className="text-xs text-zinc-500 truncate">{u.email ?? u.displayName ?? '—'}</p>
              </div>
              <div className="text-sm text-zinc-700 tabular-nums shrink-0">
                <span className="text-zinc-400 text-xs">보너스</span>{' '}
                <span className="font-semibold">{u.bonusCredits}</span>
                <span className="text-zinc-400 text-xs ml-1">cr</span>
              </div>
              <button
                type="button"
                onClick={() => { setTarget(u); setAmount(10) }}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                지급
              </button>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminConfirm
        open={!!target}
        title={target ? `${target.username}에게 크레딧 지급` : ''}
        description={target ? `현재 보너스: ${target.bonusCredits}cr` : ''}
        confirmLabel={amount >= 0 ? '지급' : '차감'}
        variant={amount < 0 ? 'danger' : 'default'}
        onClose={() => setTarget(null)}
        onConfirm={handleGrant}
        extra={
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">금액 (음수면 차감, ±1000cr까지)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
              min={-1000}
              max={1000}
              step={10}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />
            {target && (
              <p className="text-[11px] text-zinc-500">
                {target.bonusCredits}cr → <span className="font-semibold text-zinc-900">{Math.max(0, target.bonusCredits + amount)}cr</span>
              </p>
            )}
          </div>
        }
      />
    </div>
  )
}
