'use client'
// 커뮤니티 글 투표 — 단일 선택. 투표 전=옵션 버튼, 투표/종료 후=막대+%·본인 선택 강조. 24h 후 종료.
import { useState, useEffect } from 'react'
import { toast } from '@/components/toast/toast'
import type { CommunityPoll } from '@/types/domain'

function remainLabel(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return '종료됨'
  const h = Math.floor(diff / 3600000)
  if (h >= 1) return `${h}시간 후 종료`
  const m = Math.max(1, Math.floor(diff / 60000))
  return `${m}분 후 종료`
}

export function PollCard({ poll: initial, postId, gate }: { poll: CommunityPoll; postId: string; gate: () => boolean }) {
  const [poll, setPoll] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPoll(initial) }, [initial])

  const ended = new Date(poll.endsAt).getTime() <= Date.now()
  const voted = poll.myVote !== null
  const showResults = ended || voted

  async function vote(i: number) {
    if (busy || showResults) return
    if (!gate()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/community-posts/${postId}/poll/vote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionIndex: i }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error === 'ended' ? '종료된 투표예요' : j.error === 'already_voted' ? '이미 투표했어요' : '투표에 실패했어요'); return }
      setPoll(j.poll)
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {poll.options.map((opt, i) => {
        const count = poll.counts[i] ?? 0
        const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0
        const mine = poll.myVote === i
        if (!showResults) {
          return (
            <button key={i} type="button" onClick={() => vote(i)} disabled={busy}
              className="w-full h-11 rounded-xl border border-white/[0.12] hover:border-violet-500 hover:bg-white/[0.04] text-sm text-white px-3.5 text-left transition disabled:opacity-50">
              {opt}
            </button>
          )
        }
        return (
          <div key={i} className={`relative h-11 rounded-xl overflow-hidden border isolate ${mine ? 'border-white/60' : 'border-white/[0.08]'}`}>
            <div className="absolute inset-0 bg-[#1c1f27]" />
            <div className={`absolute inset-y-0 left-0 ${mine ? 'bg-white' : 'bg-white/[0.10]'}`} style={{ width: `${pct}%` }} />
            {/* mix-blend-difference — 흰 채움 위 텍스트는 검정, 어두운 부분 위는 흰색으로 자동 반전 */}
            <div className={`relative flex items-center h-full ${mine ? 'mix-blend-difference text-white' : ''}`}>
              <span className={`px-3.5 text-sm truncate ${mine ? 'font-semibold' : 'text-zinc-200'}`}>{opt}</span>
              <span className={`ml-auto px-3.5 text-sm font-semibold tabular-nums ${mine ? '' : 'text-zinc-400'}`}>{pct}%</span>
            </div>
          </div>
        )
      })}
      <p className="text-[11px] text-zinc-500 pt-0.5">{poll.totalVotes}표 · {remainLabel(poll.endsAt)}</p>
    </div>
  )
}
