import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import type { Song } from '@mono/shared'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 재생시간 m:ss (없으면 null)
function fmtDuration(sec?: number | null): string | null {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 곡 한 줄 — 커버(재생시간 오버레이)·제목(모델 배지)·상태·통계(공개 여부). 탭→재생, ⋯→액션(onMore).
export function SongRow({ song, onPress, onMore }: { song: Song; onPress?: () => void; onMore?: () => void }) {
  const generating = song.status === 'generating'
  const hue = song.coverHue ?? 250
  const duration = !generating ? fmtDuration(song.duration) : null
  return (
    <Pressable
      onPress={generating ? undefined : onPress}
      style={({ pressed }) => [styles.row, pressed && !generating && styles.pressed]}
    >
      <View style={[styles.cover, { backgroundColor: `hsl(${hue}, 30%, 22%)` }]}>
        {song.coverImage ? (
          <Image source={{ uri: song.coverImage }} style={styles.coverImg} contentFit="cover" transition={150} />
        ) : null}
        {duration ? (
          <>
            <Svg style={styles.coverScrim} pointerEvents="none">
              <Defs>
                <LinearGradient id="durScrim" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={0.65} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#durScrim)" />
            </Svg>
            <Text style={styles.duration}>{duration}</Text>
          </>
        ) : null}
      </View>
      <View style={styles.meta}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{song.title?.trim() || '제목 없음'}</Text>
          {song.model === 'music-2.6' ? <Text style={styles.modelBadge}>v2.6</Text> : null}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {generating ? '생성 중…' : [song.genre, song.mood].filter(Boolean).join(' · ') || '내 음악'}
        </Text>
        {!generating ? (
          <View style={styles.stats}>
            <View style={styles.stat}><Icon name="play.fill" size={13} color={mono.color.textTertiary} /><Text style={styles.statText}>{song.playCount ?? 0}</Text></View>
            <View style={styles.stat}><Icon name="heart" size={13} color={mono.color.textTertiary} /><Text style={styles.statText}>{song.likeCount ?? 0}</Text></View>
            <View style={styles.stat}><Icon name="bubble.left" size={13} color={mono.color.textTertiary} /><Text style={styles.statText}>{song.commentCount ?? 0}</Text></View>
            {song.published ? (
              <View style={styles.stat}><Icon name="compass" size={13} color={mono.color.accentLight} /><Text style={styles.publishedText}>공개</Text></View>
            ) : null}
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
  coverScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  duration: { position: 'absolute', right: 4, bottom: 3, color: mono.color.onMedia, fontSize: 10, fontWeight: '600' },
  meta: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', flexShrink: 1 },
  // 모델 배지 — v2.6만 노출(웹 파리티), 바이올렛 틴트
  modelBadge: {
    color: mono.color.accentLight, fontSize: 10, fontWeight: '700',
    backgroundColor: 'rgba(124,58,237,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { color: mono.color.textTertiary, fontSize: mono.font.small },
  // 공개 — 통계 행에서 compass 아이콘+텍스트(둘러보기 노출 표시, 댓글 통계와 동일 형태)
  publishedText: { color: mono.color.accentLight, fontSize: mono.font.small, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: mono.color.accent },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
})
