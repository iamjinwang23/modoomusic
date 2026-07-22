import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'

// 스크롤 방향 연동 자동 숨김 헤더 — 올리면 헤더가 딸려 올라가 숨고, 내리면 다시 내려와 나타남.
// 둘러보기·라이브러리처럼 상단 타이틀+필터칩을 접는 화면에 공용.
export function useAutoHideHeader(initialHeight = 0) {
  const [headerHeight, setHeaderHeight] = useState(initialHeight)
  const headerH = useSharedValue(initialHeight)
  const translateY = useSharedValue(0) // 0=보임, -H=숨김
  const lastY = useSharedValue(0)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y
      const dy = y - lastY.value
      if (y <= 0) {
        translateY.value = 0 // 최상단에선 항상 보임
      } else {
        translateY.value = Math.min(0, Math.max(-headerH.value, translateY.value - dy))
      }
      lastY.value = y
    },
  })

  const headerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

  const onHeaderLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    headerH.value = h
    setHeaderHeight(h)
  }

  // translateY·headerH도 노출 — 소비 측에서 슬라이드 진행도로 opacity 등 파생 스타일을 만들 수 있게(투명 헤더 겹침 방지).
  return { scrollHandler, headerStyle, onHeaderLayout, headerHeight, translateY, headerH }
}
