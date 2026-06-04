'use client'

import { useEffect, useState } from 'react'

// AI가 열일하는 듯한 분위기로 회전 노출 — 음악 제작 단계 따라 자연스럽게 변화
export const GENERATING_PHRASES = [
  '영감 떠올리는 중…',
  '악상 다듬는 중…',
  '비트 찍는 중…',
  '가사 쓰는 중…',
  '코드 진행 짜는 중…',
  '보컬 입히는 중…',
  '멜로디 그리는 중…',
  '분위기 잡는 중…',
  '후렴구 매만지는 중…',
  '믹싱 작업 중…',
  '마스터링 막바지…',
  '음표 굽는 중…',
]

interface Props {
  intervalMs?: number
  /** ISO 시작 시간 — 주면 자동으로 경과 초 계산해 뒤에 붙임 */
  startedAt?: string
  /** 수동 경과 초 (외부 hook에서 받음 — startedAt보다 우선) */
  elapsedSec?: number
  className?: string
}

export function GeneratingPhrase({ intervalMs = 5000, startedAt, elapsedSec, className }: Props) {
  // SSR-stable 초기값 — mount 후 useEffect에서 랜덤 시작점으로 이동 (hydration mismatch 회피)
  const [idx, setIdx] = useState(0)
  const [autoElapsed, setAutoElapsed] = useState<number | null>(null)

  useEffect(() => {
    setIdx(Math.floor(Math.random() * GENERATING_PHRASES.length))
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % GENERATING_PHRASES.length)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  useEffect(() => {
    if (!startedAt) { setAutoElapsed(null); return }
    const update = () => setAutoElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [startedAt])

  const seconds = elapsedSec ?? autoElapsed
  const text = GENERATING_PHRASES[idx]
  return <span className={className}>{seconds != null && seconds >= 0 ? `${text} ${seconds}초` : text}</span>
}
