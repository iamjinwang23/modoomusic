'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'

interface CreditState {
  used: number
  limit: number
  remaining: number     // 일일 잔여 (limit - used)
  bonus: number         // 친구 초대·관리자 지급 등 영구 보너스 잔여
  total: number         // 사용 가능 총량 (remaining + bonus)
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

  // 일일 + 보너스 합산 잔여 — 보너스가 있으면 일일 0이어도 사용 가능
  const total = state.total ?? (state.remaining + (state.bonus ?? 0))
  const isEmpty = total <= 0
  const isLow   = !isEmpty && total <= 2
  const bonusPart = state.bonus ?? 0
  const tip = isEmpty
    ? '크레딧을 모두 사용했어요'
    : bonusPart > 0
      ? `총 ${total}크레딧 (오늘 ${state.remaining} + 보너스 ${bonusPart})`
      : `오늘 ${state.remaining}크레딧 남음`

  return (
    <button
      type="button"
      onClick={() => {
        if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true') {
          window.dispatchEvent(new Event('open-credit-purchase'))
        } else {
          window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: isEmpty ? 'daily-limit' : 'sidebar' }))
        }
      }}
      className="h-8 flex items-center gap-2 px-3 rounded-full border border-white/25 bg-white/[0.04] hover:bg-white/[0.10] hover:border-white/40 transition-colors"
      title={tip}
    >
      <span className="text-xs font-semibold tracking-wide text-white">FREE</span>
      <span className="h-3.5 w-px bg-white/40" aria-hidden />
      <span className="flex items-center gap-1">
        <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
        <span className={`text-sm font-medium tabular-nums ${isEmpty ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'}`}>
          {total}
        </span>
      </span>
    </button>
  )
}
