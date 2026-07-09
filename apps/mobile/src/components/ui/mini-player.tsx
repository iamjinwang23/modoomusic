import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import TrackPlayer, { State, useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player'
import { Image } from 'expo-image'
import { BlurView } from 'expo-blur'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 탭바 콘텐츠 높이(_layout.tsx의 tabBarStyle.height = 62 + insets.bottom와 동일)
const TAB_BAR_HEIGHT = 62

// 하단 미니 플레이어 — 현재 트랙·재생상태. 트랙 없으면 숨김.
// 하단 네비에 밀착(풀폭·라운드 없음): 탭바 위(bottom = 탭바 높이)에 고정.
export function MiniPlayer() {
  const insets = useSafeAreaInsets()
  const track = useActiveTrack()
  const playback = usePlaybackState()
  const { position, duration } = useProgress(500)
  if (!track) return null

  const playing = playback.state === State.Playing || playback.state === State.Buffering
  const toggle = () => (playing ? TrackPlayer.pause() : TrackPlayer.play())
  const pct = duration > 0 ? Math.min(1, position / duration) : 0

  return (
    <Pressable
      style={[styles.bar, { bottom: TAB_BAR_HEIGHT + insets.bottom }]}
      onPress={() => router.push('/player')}
    >
      {/* 글래스모피즘 — 뒤 콘텐츠가 흐릿하게 비침 */}
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.row}>
        <View style={styles.cover}>
          {track.artwork ? <Image source={{ uri: String(track.artwork) }} style={styles.coverImg} contentFit="cover" /> : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>{track.title ?? '재생 중'}</Text>
        <Pressable onPress={toggle} style={styles.btn} hitSlop={10}>
          <Icon name={playing ? 'pause.fill' : 'play.fill'} size={20} color={mono.color.text} />
        </Pressable>
      </View>
      {/* 진행바 — 하단 네비와 미니바 사이(바 하단 가장자리) */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // 풀폭·라운드 없음·탭바 위 밀착. 글래스(블러) 배경 + 상단 헤어라인으로 피드와 구분.
  bar: {
    position: 'absolute', left: 0, right: 0, overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)',
  },
  // 블러 위 살짝 어두운 틴트 — 커버·제목·아이콘 가독성
  tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,22,28,0.35)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14 },
  // 커버 = 세로(3:4) — 브랜드 정체성(웹 파리티)
  cover: { width: 36, aspectRatio: 3 / 4, borderRadius: 6, backgroundColor: mono.color.surface, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  title: { flex: 1, color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 2.5, backgroundColor: mono.color.fillStrong },
  progressFill: { height: '100%', backgroundColor: mono.color.accent },
})
