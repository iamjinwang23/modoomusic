import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type LayoutChangeEvent } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import MaskedView from '@react-native-masked-view/masked-view'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'

const GAP = 44          // 두 카피 사이 간격
const SPEED = 40        // px/초
const EDGE = 24         // 좌우 페이드 폭(px)

// 좌우 가장자리 알파 페이드 마스크(양끝 투명 → 안쪽 불투명). 컨테이너 폭 기준 분수 offset.
function EdgeFade({ width }: { width: number }) {
  const f = width > 0 ? Math.min(EDGE / width, 0.45) : 0.12
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="edgeFade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#fff" stopOpacity="0" />
          <Stop offset={f} stopColor="#fff" stopOpacity="1" />
          <Stop offset={1 - f} stopColor="#fff" stopOpacity="1" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#edgeFade)" />
    </Svg>
  )
}

// 텍스트가 컨테이너보다 길면 가로로 흐르는(마퀴) 한 줄 텍스트. 짧으면 정지(그대로 렌더).
// 자연 폭은 넓은 래퍼 안 숨김 텍스트로 측정. 넘칠 때만 좌우 알파 페이드(MaskedView=컨테이너 폭 고정).
export function Marquee({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const [containerW, setContainerW] = useState(0)
  const [textW, setTextW] = useState(0)
  const x = useSharedValue(0)

  const overflow = textW > 0 && containerW > 0 && textW > containerW + 1

  useEffect(() => {
    cancelAnimation(x)
    x.value = 0
    if (overflow) {
      const distance = textW + GAP
      x.value = withRepeat(withTiming(-distance, { duration: (distance / SPEED) * 1000, easing: Easing.linear }), -1, false)
    }
    return () => cancelAnimation(x)
  }, [overflow, textW, x])

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))

  const onContainer = (e: LayoutChangeEvent) => setContainerW(e.nativeEvent.layout.width)
  const onMeasure = (e: LayoutChangeEvent) => setTextW(e.nativeEvent.layout.width)

  return (
    <View style={styles.clip} onLayout={onContainer}>
      {/* 자연 폭 측정용(안 보임) — 아주 넓은 래퍼 안이라 안 잘리고 콘텐츠 폭 그대로 측정됨 */}
      <View style={styles.measureWrap} pointerEvents="none">
        <Text style={[style, styles.measureText]} onLayout={onMeasure} numberOfLines={1}>{text}</Text>
      </View>

      {overflow ? (
        // MaskedView 프레임 = 컨테이너 폭(stretch). 넘치는 스크롤 텍스트는 프레임 밖으로 잘리고 좌우가 페이드.
        <MaskedView style={styles.mask} maskElement={<EdgeFade width={containerW} />}>
          <Animated.View style={[styles.row, animStyle]}>
            <Text style={[style, { width: textW }]} numberOfLines={1}>{text}</Text>
            <Text style={[style, { width: textW, marginLeft: GAP }]} numberOfLines={1}>{text}</Text>
          </Animated.View>
        </MaskedView>
      ) : (
        <Text style={style} numberOfLines={1}>{text}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', alignSelf: 'stretch' },
  mask: { alignSelf: 'stretch', overflow: 'hidden' },
  row: { flexDirection: 'row', alignSelf: 'flex-start' },
  // 측정 전용(안 보임): 넓은 고정 폭 래퍼라 numberOfLines=1이 안 잘림 → 텍스트가 자연 폭으로 측정됨
  measureWrap: { position: 'absolute', left: 0, top: 0, width: 9999, opacity: 0 },
  measureText: { alignSelf: 'flex-start' },
})
