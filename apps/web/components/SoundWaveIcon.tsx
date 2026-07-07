// 재생 중인 곡 썸네일에 표시되는 사운드 웨이브 애니메이션
// 외부 CSS 의존 없이 단일 컴포넌트에서 keyframes를 인라인으로 주입
export function SoundWaveIcon({ className = '', size = 20, color = '#fff' }: { className?: string; size?: number; color?: string }) {
  const barW = Math.max(2, Math.round(size * 0.17))
  const gap = Math.max(2, Math.round(size * 0.14))
  return (
    <>
      {/* keyframes는 동일한 이름이면 한 번만 등록되어 중복 OK */}
      <style>{`
        @keyframes sw-anim {
          0%, 100% { transform: scaleY(0.3); }
          50%      { transform: scaleY(1); }
        }
      `}</style>
      <div
        className={`flex items-end justify-center ${className}`}
        style={{ height: size, gap }}
        aria-label="재생 중"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: 'block',
              width: barW,
              height: '100%',
              background: color,
              borderRadius: 9999,
              transformOrigin: 'bottom',
              animation: 'sw-anim 0.9s ease-in-out infinite',
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
    </>
  )
}
