import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated'
import { mono } from '@/theme/mono'

// 숨쉬듯 뛰는 단일 dot — 색상이 violet↔blue 그라데이션으로 순환. 생성 중 상태 표시(곡 행 등).
export function BreathingDot({ size = 9 }: { size?: number }) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [p])
  // 크기는 고정, 색상만 violet↔blue로 순환(숨쉬듯). 어두워 보여 채도·명도 높인 vivid 톤.
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], ['#a855f7', '#5b9bff']),
  }))
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />
}

// 생성 중 인터랙션 — violet→blue 그라데이션 dots가 은은하게 물결치듯 움직임(ChatGPT 이미지 생성 느낌).
// 스피너 대체. label 옵션으로 안내 문구 하단 표시.
const DOT_COLORS = ['#7c3aed', '#8b5cf6', '#6d8bef', '#5b8def'] // 좌→우 그라데이션

function Dot({ index }: { index: number }) {
  const p = useSharedValue(0)
  useEffect(() => {
    // 인덱스마다 지연 → 물결(웨이브). reverse repeat로 0↔1 왕복.
    p.value = withDelay(index * 160, withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true))
  }, [index, p])
  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + p.value * 0.7,
    transform: [{ translateY: -5 * p.value }, { scale: 0.8 + p.value * 0.35 }],
  }))
  return <Animated.View style={[styles.dot, { backgroundColor: DOT_COLORS[index] }, style]} />
}

export function GeneratingDots({ label }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {DOT_COLORS.map((_, i) => <Dot key={i} index={i} />)}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  row: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
})
