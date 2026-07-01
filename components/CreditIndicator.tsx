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
      onClick={() => window.dispatchEvent(new Event('open-credit-purchase'))}
      className="h-10 flex items-center gap-1.5 px-3 rounded-full border border-white/[0.10] hover:border-white/20 transition-colors"
      title={tip}
    >
      <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
      <span className={`text-sm font-semibold tabular-nums ${isEmpty ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'}`}>
        {total}
      </span>
    </button>
  )
}
