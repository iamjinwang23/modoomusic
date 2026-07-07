'use client'

// 페이지 fixed 배경 — 탐색 페이지가 mount되어 있는 동안만 노출.
// 부모 무관, 항상 뷰포트 기준. z-index 0(콘텐츠 아래)으로 배치.
export function AuroraBackground() {
  return (
    <div className="fixed inset-y-0 right-0 left-0 md:left-60 overflow-hidden pointer-events-none z-0" aria-hidden>
      <div
        className="aurora-layer absolute -inset-[10px]"
        style={{
          maskImage: 'linear-gradient(to bottom, black 0%, black 8%, transparent 30%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 8%, transparent 30%)',
        }}
      />
    </div>
  )
}
