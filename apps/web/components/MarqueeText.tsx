'use client'

import { useRef, useState, useLayoutEffect } from 'react'

const GAP = 48    // px — 반복 사이 간격
const SPEED = 50  // px/s — 스크롤 속도

interface Props {
  text: string
  className?: string
  speed?: number
  threshold?: number
}

export function MarqueeText({ text, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [cycleWidth, setCycleWidth] = useState(0)

  useLayoutEffect(() => {
    let rafId: ReturnType<typeof requestAnimationFrame>

    function check() {
      if (!containerRef.current || !textRef.current) return
      const cw = containerRef.current.getBoundingClientRect().width
      const tw = textRef.current.scrollWidth
      setCycleWidth(tw > cw ? tw + GAP : 0)
    }

    check()
    // Re-check after paint — catches cases where flex layout wasn't settled yet
    rafId = requestAnimationFrame(check)

    const ro = new ResizeObserver(check)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafId)
    }
  }, [text])

  const scrolling = cycleWidth > 0
  // marquee-scroll keyframe uses translateX(-50%).
  // Structure is [text][gap][text][gap] → total = 2×cycleWidth → -50% = -cycleWidth ✓
  const duration = scrolling ? cycleWidth / SPEED : 0

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${className}`}
      style={scrolling ? {
        maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
      } : undefined}
    >
      <div
        className="inline-flex"
        style={scrolling ? {
          animation: `marquee-scroll ${duration}s linear infinite`,
          animationDelay: '0.4s',
          willChange: 'transform',
        } : undefined}
      >
        <span ref={textRef} className="whitespace-nowrap">{text}</span>
        {scrolling && (
          <>
            <span className="inline-block shrink-0" style={{ width: GAP }} aria-hidden />
            <span className="whitespace-nowrap shrink-0" aria-hidden>{text}</span>
            <span className="inline-block shrink-0" style={{ width: GAP }} aria-hidden />
          </>
        )}
      </div>
    </div>
  )
}
