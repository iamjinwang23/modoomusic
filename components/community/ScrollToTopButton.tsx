'use client'
// 스크롤 컨테이너 우측 하단 "맨 위로" 플로팅 버튼 — 일정 이상 내리면 나타남.
import { useEffect, useState } from 'react'

export function ScrollToTopButton({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setVisible(el.scrollTop > 400)
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed right-5 md:right-8 bottom-24 md:bottom-8 z-40 w-11 h-11 rounded-full bg-white hover:bg-zinc-100 border border-zinc-300 shadow-lg flex items-center justify-center transition active:scale-90 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none translate-y-2'
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  )
}
