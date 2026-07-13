import { useRef, useState } from 'react'
import { PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import TrackPlayer from 'react-native-track-player'
import { mono } from '@/theme/mono'

// 드래그로 탐색(seek) 가능한 프로그레스바. 재생 위치는 부모의 useProgress 값(position/duration).
// 드래그 중엔 손가락 위치로 채움을 미리 보여주고, 놓으면 그 지점으로 seekTo.
export function SeekBar({ position, duration, height = 4, color = mono.color.accent, trackColor = mono.color.fillStrong, hitVertical = 12, style }: {
  position: number
  duration: number
  height?: number
  color?: string
  trackColor?: string
  hitVertical?: number
  style?: StyleProp<ViewStyle>
}) {
  const widthRef = useRef(0)
  const durationRef = useRef(duration)
  durationRef.current = duration
  const [drag, setDrag] = useState<number | null>(null)

  const ratio = drag != null ? drag : duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0
  const clampX = (x: number) => Math.max(0, Math.min(1, x / (widthRef.current || 1)))

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => setDrag(clampX(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setDrag(clampX(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        const r = clampX(e.nativeEvent.locationX)
        setDrag(r)
        if (durationRef.current > 0) TrackPlayer.seekTo(r * durationRef.current)
        // 실제 position이 갱신될 때까지 잠깐 유지(되돌아가는 깜빡임 방지)
        setTimeout(() => setDrag(null), 350)
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width }}
      style={[styles.hit, { paddingVertical: hitVertical }, style]}
    >
      <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${ratio * 100}%`, backgroundColor: color }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hit: { justifyContent: 'center' },
})
