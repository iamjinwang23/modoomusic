import { useRef, useState } from 'react'
import { PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import TrackPlayer from 'react-native-track-player'
import { mono } from '@/theme/mono'

// 드래그로 탐색(seek) 가능한 프로그레스바. 재생 위치는 부모의 useProgress 값(position/duration).
// - 터치하면 부드럽게 두꺼워지고(scaleY, 레이아웃 영향 없음) 썸(knob)이 떠서 탐색 가능함을 인지.
// - 한 번 잡으면 손가락이 바를 벗어나도 절대 x좌표로 계속 추적(일반 음악앱 동작). 네이티브 스크롤에 안 뺏김.
export function SeekBar({ position, duration, height = 4, color = mono.color.accent, trackColor = mono.color.fillStrong, hitVertical = 12, style, onActiveChange }: {
  position: number
  duration: number
  height?: number
  color?: string
  trackColor?: string
  hitVertical?: number
  style?: StyleProp<ViewStyle>
  onActiveChange?: (active: boolean) => void // 드래그 시작/종료 — 부모가 스크롤을 잠깐 끄게(제스처 뺏김 방지)
}) {
  const widthRef = useRef(0)
  const leftRef = useRef(0) // 바의 페이지 좌측 x — 드래그를 절대좌표로 추적(바 밖으로 나가도 유지)
  const durationRef = useRef(duration)
  durationRef.current = duration
  const onActiveChangeRef = useRef(onActiveChange)
  onActiveChangeRef.current = onActiveChange
  const [drag, setDrag] = useState<number | null>(null)
  const active = useSharedValue(0)

  const ratio = drag != null ? drag : duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0
  const ratioFromAbs = (absX: number) => Math.max(0, Math.min(1, (absX - leftRef.current) / (widthRef.current || 1)))

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // 잡은 뒤 스크롤 등에 뺏기지 않음
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e, g) => {
        leftRef.current = g.x0 - e.nativeEvent.locationX
        active.value = withTiming(1, { duration: 130 })
        onActiveChangeRef.current?.(true)
        setDrag(ratioFromAbs(g.x0))
      },
      onPanResponderMove: (_e, g) => setDrag(ratioFromAbs(g.moveX)),
      onPanResponderRelease: (_e, g) => {
        const r = ratioFromAbs(g.moveX)
        setDrag(r)
        active.value = withTiming(0, { duration: 190 })
        onActiveChangeRef.current?.(false)
        if (durationRef.current > 0) TrackPlayer.seekTo(r * durationRef.current)
        // 실제 position이 갱신될 때까지 잠깐 유지(되돌아가는 깜빡임 방지)
        setTimeout(() => setDrag(null), 350)
      },
      onPanResponderTerminate: () => { active.value = withTiming(0, { duration: 190 }); onActiveChangeRef.current?.(false); setDrag(null) },
    }),
  ).current

  // scaleY로만 두껍게 → 레이아웃 리플로우 없음(주변 요소 안 들썩임). 썸은 페이드+스케일.
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + active.value }] }))
  const thumbStyle = useAnimatedStyle(() => ({ opacity: active.value, transform: [{ scale: 0.4 + active.value * 0.6 }] }))

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width }}
      style={[styles.hit, { paddingVertical: hitVertical }, style]}
    >
      <View style={styles.barWrap}>
        <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: trackColor }, trackStyle]}>
          <View style={{ height: '100%', width: `${ratio * 100}%`, borderRadius: height / 2, backgroundColor: color }} />
        </Animated.View>
        <Animated.View style={[styles.thumb, { left: `${ratio * 100}%`, backgroundColor: color }, thumbStyle]} pointerEvents="none" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hit: { justifyContent: 'center' },
  barWrap: { justifyContent: 'center' },
  thumb: {
    position: 'absolute', top: '50%', width: 13, height: 13, borderRadius: 6.5, marginTop: -6.5, marginLeft: -6.5,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
})
