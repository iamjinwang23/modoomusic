import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mono } from '@/theme/mono'

export const HEADER_ROW = 50

// 스크롤 연동 상단 헤더 — 히어로(커버/이름)가 화면 밖으로 나갈 때 페이드인.
// 좌(뒤로가기 등) · 중앙(문맥 타이틀) · 우(페이지별 액션) 슬롯. 모든 스크롤 화면에 재사용.
export function CollapsingHeader({ scrollY, fadeStart, fadeEnd, title, left, right }: {
  scrollY: SharedValue<number>
  fadeStart: number
  fadeEnd: number
  title: string
  left?: ReactNode
  right?: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const [interactive, setInteractive] = useState(false)

  // 헤더가 거의 보일 때만 터치 캡처(안 보일 땐 뒤 콘텐츠로 통과)
  useAnimatedReaction(
    () => scrollY.value >= fadeEnd - 2,
    (cur, prev) => { if (cur !== prev) runOnJS(setInteractive)(cur) },
  )

  const aStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP),
  }))

  return (
    <Animated.View
      pointerEvents={interactive ? 'auto' : 'none'}
      style={[styles.header, { paddingTop: insets.top, height: insets.top + HEADER_ROW }, aStyle]}
    >
      <View style={styles.side}>{left}</View>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={[styles.side, styles.rightAlign]}>{right}</View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    backgroundColor: mono.color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mono.color.borderSoft,
  },
  side: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rightAlign: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center', color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
})
