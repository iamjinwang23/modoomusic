'use client'

// Aurora 흐름 + 입장 fade/scale 애니메이션 — MyWorkPanel 빈 상태용
// globals.css의 .aurora-layer 클래스를 absolute로 재사용
interface Props {
  className?: string
}

export function AnimatedGradientBackground({ className = '' }: Props) {
  return (
    <div className={`absolute inset-0 overflow-hidden agb-in ${className}`} aria-hidden>
      <style>{`
        @keyframes agbIn { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: scale(1); } }
        .agb-in { animation: agbIn 2s cubic-bezier(0.25,0.1,0.25,1) both; }
        @media (prefers-reduced-motion: reduce) { .agb-in { animation: none; } }
      `}</style>
      <div
        className="aurora-layer absolute -inset-[10px]"
        style={{
          maskImage: 'linear-gradient(to bottom, black 0%, black 5%, transparent 40%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 5%, transparent 40%)',
        }}
      />
    </div>
  )
}

export default AnimatedGradientBackground
