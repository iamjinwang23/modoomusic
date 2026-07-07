import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Song } from '@mono/shared'
import { mono } from '@/theme/mono'

// 곡 한 줄 — 커버·제목·상태. 완료곡은 재생(추후 T5), 생성중은 상태 표시.
export function SongRow({ song, onPress }: { song: Song; onPress?: () => void }) {
  const generating = song.status === 'generating'
  const hue = song.coverHue ?? 250
  return (
    <Pressable
      onPress={generating ? undefined : onPress}
      style={({ pressed }) => [styles.row, pressed && !generating && styles.pressed]}
    >
      <View style={[styles.cover, { backgroundColor: `hsl(${hue}, 30%, 22%)` }]}>
        {song.coverImage ? (
          <Image source={{ uri: song.coverImage }} style={styles.coverImg} contentFit="cover" transition={150} />
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{song.title?.trim() || '제목 없음'}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {generating ? '생성 중…' : [song.genre, song.mood].filter(Boolean).join(' · ') || '내 음악'}
        </Text>
      </View>
      {generating ? <View style={styles.dot} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  pressed: { opacity: 0.7 },
  cover: { width: 52, height: 52, borderRadius: mono.radius.sm, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  meta: { flex: 1, minWidth: 0 },
  title: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: mono.color.accent },
})
