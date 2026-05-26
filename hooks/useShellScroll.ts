'use client'

import { useEffect, useRef, type RefObject } from 'react'

// 스크롤 컨테이너 ref를 받아서 방향을 감지하고 shell-header-hide 이벤트를 dispatch.
// shell layout이 이벤트를 받아 모바일 헤더를 자동으로 collapse.
//
// 사용처: 페이지별 메인 스크롤 컨테이너에 부착
//  - (main)/layout.tsx의 center div (create 페이지)
//  - ExplorePanel, ProfilePanel, MyWorkPanel 등의 overflow-y-auto 컨테이너
export function useShellScroll(targetRef: RefObject<HTMLElement | null>) {
  const lastY = useRef(0)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    function onScroll() {
      if (!el) return
      const y = el.scrollTop
      const delta = y - lastY.current

      // 맨 위 근처: 항상 표시
      if (y <= 40) {
        window.dispatchEvent(new CustomEvent('shell-header-hide', { detail: false }))
      } else if (delta > 4) {
        // 아래로 스크롤: 숨김
        window.dispatchEvent(new CustomEvent('shell-header-hide', { detail: true }))
      } else if (delta < -4) {
        // 위로 스크롤: 표시
        window.dispatchEvent(new CustomEvent('shell-header-hide', { detail: false }))
      }

      lastY.current = y
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [targetRef])
}
