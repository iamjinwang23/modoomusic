import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import TrackPlayer, { State, useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player'
import { Image } from 'expo-image'
import { BlurView } from 'expo-blur'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// expo-blur 네이티브 모듈이 바이너리에 포함됐는지 감지(구 dev 빌드엔 없음 → 폴백).
const BLUR_AVAILABLE = requireOptionalNativeModule('ExpoBlur') != null

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
      {/* 글래스모피즘 — 뒤 콘텐츠가 흐릿하게 비침. 네이티브 블러 없는 구 빌드는 불투명 폴백. */}
      {BLUR_AVAILABLE ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={[styles.tint, !BLUR_AVAILABLE && styles.tintSolid]} pointerEvents="none" />
      <View style={styles.row}>
        <View style={styles.cover}>
          {track.artwork ? <Image source={{ uri: String(track.artwork) }} style={styles.coverImg} contentFit="cover" /> : null}
        </View>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>{track.title ?? '재생 중'}</Text>
          {track.artist ? <Text style={styles.artist} numberOfLines={1}>{String(track.artist)}</Text> : null}
        </View>
        <Pressable onPress={toggle} style={styles.btn} hitSlop={10}>
          <Icon name={playing ? 'pause.fill' : 'play.fill'} size={20} color={mono.color.text} />
        </Pressable>
      </View>
      {/* 진행바 — 표시용(미니바는 시크 생략) */}
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
  // 블러 미지원(구 빌드) 폴백 — 불투명 표면색으로 깔끔하게
  tintSolid: { backgroundColor: mono.color.surface2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 14 },
  // 커버 = 세로(3:4) — 브랜드 정체성(웹 파리티)
  cover: { width: 36, aspectRatio: 3 / 4, borderRadius: 6, backgroundColor: mono.color.surface, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  meta: { flex: 1, minWidth: 0 },
  title: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  artist: { color: mono.color.textSecondary, fontSize: mono.font.tiny, marginTop: 3 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 2.5, backgroundColor: mono.color.fillStrong },
  progressFill: { height: '100%', backgroundColor: mono.color.accent },
})
