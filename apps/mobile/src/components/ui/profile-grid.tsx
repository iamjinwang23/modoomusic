import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import type { PublicSong } from '@mono/shared'
import { useNowPlaying } from '@/lib/now-playing'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 1000+ → 1.2k (웹 formatCount와 동일)
export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// 커버 하단 스크림 — 웹 `bg-gradient-to-t from-black/60`. expo-linear-gradient(네이티브) 대신
// 다중 밴드로 부드러운 그라데이션 근사(상단 투명 → 하단 진함).
const SCRIM_BANDS = 28
export function CoverScrim() {
  return (
    <View style={styles.scrim} pointerEvents="none">
      {Array.from({ length: SCRIM_BANDS }).map((_, i) => (
        <View
          key={i}
          style={{ flex: 1, backgroundColor: `rgba(0,0,0,${(0.6 * ((i + 1) / SCRIM_BANDS) ** 1.7).toFixed(3)})` }}
        />
      ))}
    </View>
  )
}

// 프로필 곡 그리드 — 웹 ProfilePanel 파리티: 음악/영상 탭 + 3열 세로(2:3) 썸네일 그리드.
// 썸네일 좌하단에 좋아요·댓글·재생 통계 오버레이(웹과 동일 순서).
export function ProfileGrid({ songs, onPlay, empty = '아직 공개된 곡이 없어요' }: {
  songs: PublicSong[]
  onPlay: (song: PublicSong) => void
  empty?: string
}) {
  const { width } = useWindowDimensions()
  // 3열 1px 간격 — 픽셀 고정(aspectRatio+퍼센트 조합은 높이 계산 실패)
  const itemW = (width - 2) / 3
  const itemH = itemW * 1.5
  return (
    <View>
      {/* 탭 바 — 음악(활성) / 영상(비활성) */}
      <View style={styles.tabs}>
        <View style={[styles.tab, styles.tabActive]}>
          <Icon name="music.note" size={19} color={mono.color.text} />
          <Text style={styles.tabLabelActive}>음악</Text>
        </View>
        <View style={styles.tab}>
          <Icon name="film" size={19} color={mono.color.textTertiary} />
          <Text style={styles.tabLabel}>영상</Text>
        </View>
      </View>

      {songs.length === 0 ? (
        <Text style={styles.empty}>{empty}</Text>
      ) : (
        <View style={styles.grid}>
          {songs.map((song) => (
            <ProfileThumb key={song.id} song={song} width={itemW} height={itemH} onPress={() => onPlay(song)} />
          ))}
        </View>
      )}
    </View>
  )
}

function ProfileThumb({ song, width, height, onPress }: { song: PublicSong; width: number; height: number; onPress: () => void }) {
  const nowPlaying = useNowPlaying()
  const isPlaying = nowPlaying?.id === song.id
  const hue = song.coverHue ?? 250
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.thumb, { width, height }, pressed && styles.thumbPressed]}>
      <View style={[styles.thumbBg, { backgroundColor: `hsl(${hue}, 45%, 32%)` }]}>
        {song.coverImage ? (
          <Image source={{ uri: song.coverImage }} style={styles.thumbImg} contentFit="cover" transition={150} />
        ) : null}
      </View>

      {isPlaying ? (
        <View style={styles.playingOverlay}>
          <Icon name="play.fill" size={20} color={mono.color.onMedia} />
        </View>
      ) : null}

      <View style={styles.statsOverlay}>
        <View style={styles.stat}>
          <Icon name="heart" size={11} color={mono.color.onMedia} />
          <Text style={styles.statText}>{formatCount(song.likeCount)}</Text>
        </View>
        <View style={styles.stat}>
          <Icon name="bubble.left" size={11} color={mono.color.onMedia} />
          <Text style={styles.statText}>{formatCount(song.commentCount)}</Text>
        </View>
        <View style={styles.stat}>
          <Icon name="play.fill" size={11} color={mono.color.onMedia} />
          <Text style={styles.statText}>{formatCount(song.playCount)}</Text>
        </View>
      </View>

      <View style={styles.thumbRing} pointerEvents="none" />
    </Pressable>
  )
}

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '68%' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mono.color.borderSoft },
  tab: { flex: 1, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: mono.color.text, marginBottom: -StyleSheet.hairlineWidth },
  tabLabel: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  tabLabelActive: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.small, textAlign: 'center', paddingVertical: 40 },
  // 3열 세로 그리드 — 웹과 동일하게 1px 간격, 풀블리드
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  thumb: { backgroundColor: mono.color.surface },
  thumbPressed: { opacity: 0.8 },
  thumbBg: { ...FILL },
  thumbImg: { width: '100%', height: '100%' },
  playingOverlay: {
    ...FILL,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)',
  },
  statsOverlay: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', gap: 7 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statText: {
    color: mono.color.onMedia, fontSize: 10, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 2,
  },
  thumbRing: { ...FILL, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
})
