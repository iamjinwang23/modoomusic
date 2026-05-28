'use client'

import { useEffect, useMemo, useState } from 'react'

// 부유하는 점들 — tsparticles 없이 순수 CSS. 작은 점들이 천천히 떠오르며 반짝임.
// 하단 그라데이션 쪽에 모이도록 top 분포를 아래쪽에 가중.
// 랜덤 위치는 mount 후에만 렌더해 SSR 하이드레이션 불일치 회피.
export function FloatingDots({ count = 50, className = '' }: { count?: number; className?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const dots = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,        // 가로 위치(%) — 0~100 전체 폭에 고르게
        top: 55 + Math.random() * 100,    // 세로 위치(%) — 55~155, 하단 가중(155%는 화면 밖→clip, 글로우 쪽 집중)
        size: 1 + Math.random() * 2,      // 점 지름(px) — 1~3, 작을수록 미세한 입자감
        delay: Math.random() * 7,         // 애니메이션 시작 지연(s) — 0~7, 점마다 달라 동시 깜빡임 방지
        dur: 5 + Math.random() * 7,       // 한 사이클 길이(s) — 5~12, 떠오르고 사라지는 속도
        op: 0.25 + Math.random() * 0.5,   // 최대 불투명도 — 0.25~0.75, 점별 밝기 편차
      })),
    [count],
  )

  if (!mounted) return null

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
      <style>{`
        @keyframes dotFloat {
          0%   { transform: translateY(6px); opacity: 0; }
          25%  { opacity: var(--dot-op, 0.6); }
          75%  { opacity: var(--dot-op, 0.6); }
          100% { transform: translateY(-26px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fdot { animation: none !important; opacity: var(--dot-op, 0.5) !important; }
        }
      `}</style>
      {dots.map((d, i) => (
        <span
          key={i}
          className="fdot absolute rounded-full bg-white"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            ['--dot-op' as string]: String(d.op),
            animation: `dotFloat ${d.dur}s ease-in-out ${d.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export default FloatingDots
