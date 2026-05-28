'use client'

import type React from 'react'

// 테두리를 따라 한 바퀴 도는 빛 — conic-gradient 회전 + 마스크 링.
// framer-motion 없이 순수 CSS. 부모는 relative + overflow-hidden + 동일 radius 권장.
// 속도(durationMs)·밝기(opacity)는 CSS 변수로 인스턴스별 조정.
export function BeamBorder({
  className = 'rounded-2xl',
  durationMs = 8000,
  opacity = 0.5,
}: { className?: string; durationMs?: number; opacity?: number }) {
  return (
    <>
      <style>{`
        @property --beamAngle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
        @keyframes beamSpin { to { --beamAngle: 360deg; } }
        .beam-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: conic-gradient(from var(--beamAngle), transparent 0deg, transparent 300deg, rgba(255,255,255,var(--beam-op,0.5)) 345deg, transparent 360deg);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          animation: beamSpin var(--beam-dur, 8s) linear infinite;
        }
        @media (prefers-reduced-motion: reduce) { .beam-border::before { animation: none; } }
      `}</style>
      <div
        className={`beam-border pointer-events-none absolute inset-0 z-40 ${className}`}
        style={{ ['--beam-dur' as string]: `${durationMs}ms`, ['--beam-op' as string]: String(opacity) } as React.CSSProperties}
        aria-hidden
      />
    </>
  )
}
