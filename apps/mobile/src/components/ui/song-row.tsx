import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Song } from '@mono/shared'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 곡 한 줄 — 커버·제목·상태·공개배지. 탭→재생, ⋯→액션(onMore).
export function SongRow({ song, onPress, onMore }: { song: Song; onPress?: () => void; onMore?: () => void }) {
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
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{song.title?.trim() || '제목 없음'}</Text>
          {song.published ? <Text style={styles.badge}>게시됨</Text> : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {generating ? '생성 중…' : [song.genre, song.mood].filter(Boolean).join(' · ') || '내 음악'}
        </Text>
        {!generating ? (
          <View style={styles.stats}>
            <View style={styles.stat}><Icon name="play.fill" size={13} color={mono.color.textTertiary} /><Text style={styles.statText}>{song.playCount ?? 0}</Text></View>
            <View style={styles.stat}><Icon name="heart" size={13} color={mono.color.textTertiary} /><Text style={styles.statText}>{song.likeCount ?? 0}</Text></View>
            <View style={styles.stat}><Icon name="bubble.left" size={13} color={mono.color.textTertiary} /><Text style={styles.statText}>{song.commentCount ?? 0}</Text></View>
          </View>
        ) : null}
      </View>
      {generating ? (
        <View style={styles.dot} />
      ) : onMore ? (
        <Pressable onPress={onMore} hitSlop={12} style={styles.more}><Icon name="ellipsis" size={18} color={mono.color.textSecondary} /></Pressable>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  pressed: { opacity: 0.7 },
  // 커버 = 세로(포트레이트) — 브랜드 정체성(웹 파리티)
  cover: { width: 54, aspectRatio: 3 / 4, borderRadius: mono.radius.sm, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  meta: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', flexShrink: 1 },
  badge: {
    color: mono.color.accentLight, fontSize: mono.font.tiny, fontWeight: '700',
    backgroundColor: mono.color.fill, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { color: mono.color.textTertiary, fontSize: mono.font.small },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: mono.color.accent },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: mono.color.textSecondary, fontSize: 20, fontWeight: '700' },
})
