import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

// 스켈레톤 shimmer — 반투명 흰 빛 밴드가 좌→우로 슥 지나감. 부모 위에 absolute로 얹어 "생성 중" 느낌.
export function SkeletonShimmer() {
  const [w, setW] = useState(0)
  const x = useSharedValue(0)
  useEffect(() => {
    if (w === 0) return
    x.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, false)
  }, [w, x])
  const band = w * 0.6
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -band + x.value * (w + band) }] }))
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setW(e.nativeEvent.layout.width)} pointerEvents="none">
      {w > 0 ? (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: band }, style]}>
          <Svg width={band} height="100%">
            <Defs>
              <LinearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.16} />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#shimmer)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}
