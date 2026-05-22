'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'

interface CreditState {
  used: number
  limit: number
  remaining: number
  resetAt: string
}

export function CreditIndicator() {
  const { user } = useAuth()
  const [state, setState] = useState<CreditState | null>(null)

  useEffect(() => {
    if (!user) { setState(null); return }
    let cancelled = false
    fetch('/api/credits/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data) setState(data) })
    return () => { cancelled = true }
  }, [user?.id])

  useEffect(() => {
    function handler(e: Event) { setState((e as CustomEvent<CreditState>).detail) }
    window.addEventListener('credits-updated', handler)
    return () => window.removeEventListener('credits-updated', handler)
  }, [])

  if (!user || !state) return null

  const isEmpty = state.remaining <= 0
  const isLow   = !isEmpty && state.remaining <= 2

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: isEmpty ? 'daily-limit' : 'sidebar' }))}
      className="h-8 flex items-center gap-2 px-3 rounded-full border border-white bg-white/[0.04] hover:bg-white/[0.10] transition-colors"
      title={isEmpty ? '오늘의 크레딧을 모두 사용했어요' : `오늘 ${state.remaining}크레딧 남음`}
    >
      <span className="text-xs font-semibold tracking-wide text-white">FREE</span>
      <span className="h-3.5 w-px bg-white/40" aria-hidden />
      <span className="flex items-center gap-1">
        <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
        <span className={`text-sm font-medium tabular-nums ${isEmpty ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'}`}>
          {state.remaining}
        </span>
      </span>
    </button>
  )
}
