'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// 스크롤 컨테이너에 부착할 수 있는 callback ref를 반환.
// 페이지에 loading 상태가 있어서 ref 부착 시점이 늦어지는 경우에도
// element가 실제로 mount되는 순간 setEl이 발동되어 listener가 등록됨.
//
// 사용:
//   const scrollRef = useShellScroll()
//   <div ref={scrollRef} className="overflow-y-auto">...</div>
//
// 이벤트: 'shell-header-hide' (detail: boolean)
//   - true:  스크롤 다운 (40px 이상에서) → 헤더 숨김
//   - false: 스크롤 업 또는 맨 위(<40px) → 헤더 표시
export function useShellScroll() {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const lastY = useRef(0)

  const ref = useCallback((node: HTMLElement | null) => {
    setEl(node)
  }, [])

  useEffect(() => {
    if (!el) return
    lastY.current = el.scrollTop

    function onScroll() {
      if (!el) return
      const y = el.scrollTop
      const delta = y - lastY.current

      if (y <= 40) {
        window.dispatchEvent(new CustomEvent('shell-header-hide', { detail: false }))
      } else if (delta > 4) {
        window.dispatchEvent(new CustomEvent('shell-header-hide', { detail: true }))
      } else if (delta < -4) {
        window.dispatchEvent(new CustomEvent('shell-header-hide', { detail: false }))
      }

      lastY.current = y
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [el])

  return ref
}
