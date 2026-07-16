import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated'

// 재생 중 사운드 웨이브 — 막대 3개가 위아래로 춤춤(애플뮤직·스포티파이 now-playing 인디케이터).
// paused면 정지(중간 높이 고정). 커버 위 오버레이용.
function Bar({ index, playing, color }: { index: number; playing: boolean; color: string }) {
  const h = useSharedValue(0.4)
  useEffect(() => {
    if (playing) {
      h.value = withDelay(
        index * 130,
        withRepeat(withTiming(1, { duration: 380 + index * 70, easing: Easing.inOut(Easing.quad) }), -1, true),
      )
    } else {
      h.value = withTiming(0.45, { duration: 200 })
    }
  }, [playing, index, h])
  const style = useAnimatedStyle(() => ({ height: `${20 + h.value * 80}%` }))
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />
}

export function PlayingBars({ playing, color = '#ffffff', size = 20 }: { playing: boolean; color?: string; size?: number }) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {[0, 1, 2].map((i) => <Bar key={i} index={i} playing={playing} color={color} />)}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.5 },
  bar: { width: 3, borderRadius: 2 },
})
