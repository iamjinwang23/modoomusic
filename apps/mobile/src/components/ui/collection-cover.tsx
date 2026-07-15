import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import type { Collection } from '@mono/shared'
import { mono } from '@/theme/mono'

// 컬렉션 정방형 커버 — 담긴 첫 곡 id 해시로 대각선 그라데이션(웹 파리티 근사). 비면 회색.
export function CollectionCover({ collection, size = 44, radius = mono.radius.sm }: { collection: Collection; size?: number; radius?: number }) {
  const seed = collection.songIds[0] ?? collection.id
  const hue = (seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  const box = { width: size, height: size, borderRadius: radius }
  if (collection.songIds.length === 0) {
    return <View style={[box, styles.empty]} />
  }
  const gid = `colcov-${collection.id}-${size}`
  return (
    <View style={[box, styles.wrap]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={`hsl(${hue}, 65%, 48%)`} />
            <Stop offset="1" stopColor={`hsl(${h2}, 55%, 32%)`} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  empty: { backgroundColor: mono.color.surface2 },
})
