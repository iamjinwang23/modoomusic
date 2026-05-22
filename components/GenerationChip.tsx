'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getPending, getElapsedSeconds, type PendingInfo } from '@/services/generation.store'

function formatElapsed(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec}s`
  return `${m}:${String(sec).padStart(2, '0')}`
}

// 곡 생성 중 어느 페이지에서도 보이는 인디케이터
export function GenerationChip() {
  const [pending, setPending] = useState<PendingInfo | null>(() => getPending())
  const [elapsed, setElapsed] = useState(() => getElapsedSeconds())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(getElapsedSeconds()), 1000)
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  useEffect(() => {
    // 마운트 시점에 이미 생성 중이면 타이머 즉시 시작
    if (getPending()) startTimer()

    function onState() {
      const cur = getPending()
      setPending(cur)
      setElapsed(getElapsedSeconds())
      if (cur) startTimer()
      else stopTimer()
    }
    window.addEventListener('generation-state', onState)
    return () => {
      window.removeEventListener('generation-state', onState)
      stopTimer()
    }
  }, [])

  if (!pending) return null

  const label = pending.title?.trim() || pending.prompt.slice(0, 16) + (pending.prompt.length > 16 ? '…' : '')

  return (
    <Link
      href="/"
      title={`'${label}' 생성 중`}
      className="h-8 flex items-center gap-2 px-3 rounded-full bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/40 transition-colors max-w-[180px]"
    >
      <svg className="w-3 h-3 animate-spin shrink-0 text-violet-300" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
      <span className="text-xs font-medium text-violet-200 truncate">{label}</span>
      <span className="text-[11px] font-medium tabular-nums text-violet-300 shrink-0">{formatElapsed(elapsed)}</span>
    </Link>
  )
}
