'use client'

import { useEffect, useRef } from 'react'

// breathing radial gradient 배경 — framer-motion 없이 rAF + CSS 키프레임으로 구현.
// 입장 애니메이션(opacity/scale)은 .agb-in 키프레임이 대체.
interface Props {
  startingGap?: number
  breathing?: boolean
  gradientColors?: string[]
  gradientStops?: number[]
  animationSpeed?: number
  breathingRange?: number
  topOffset?: number
  className?: string
}

export function AnimatedGradientBackground({
  startingGap = 125,
  breathing = true,
  // MONO 다크 테마 — 중심(상단) 어두운 베이스 → 보라/인디고 글로우
  gradientColors = ['#181B22', '#1e1b4b', '#4c1d95', '#6d28d9', '#7c3aed', '#a78bfa'],
  gradientStops = [40, 55, 68, 80, 90, 100],
  animationSpeed = 0.02,
  breathingRange = 6,
  topOffset = 0,
  className = '',
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let raf: number
    let width = startingGap
    let dir = 1
    const tick = () => {
      if (width >= startingGap + breathingRange) dir = -1
      if (width <= startingGap - breathingRange) dir = 1
      if (!breathing) dir = 0
      width += dir * animationSpeed
      const stops = gradientStops.map((s, i) => `${gradientColors[i]} ${s}%`).join(', ')
      if (ref.current) {
        ref.current.style.background = `radial-gradient(${width}% ${width + topOffset}% at 50% 20%, ${stops})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [startingGap, breathing, gradientColors, gradientStops, animationSpeed, breathingRange, topOffset])

  return (
    <div className={`absolute inset-0 overflow-hidden agb-in ${className}`} aria-hidden>
      <style>{`
        @keyframes agbIn { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
        .agb-in { animation: agbIn 2s cubic-bezier(0.25,0.1,0.25,1) both; }
        @media (prefers-reduced-motion: reduce) { .agb-in { animation: none; } }
      `}</style>
      <div ref={ref} className="absolute inset-0" />
    </div>
  )
}

export default AnimatedGradientBackground
