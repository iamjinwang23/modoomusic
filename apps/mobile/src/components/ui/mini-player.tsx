import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import TrackPlayer, { State, useActiveTrack, usePlaybackState } from 'react-native-track-player'
import { Image } from 'expo-image'
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
  if (!track) return null

  const playing = playback.state === State.Playing || playback.state === State.Buffering
  const toggle = () => (playing ? TrackPlayer.pause() : TrackPlayer.play())

  return (
    <Pressable
      style={[styles.bar, { bottom: TAB_BAR_HEIGHT + insets.bottom }]}
      onPress={() => router.push('/player')}
    >
      <View style={styles.cover}>
        {track.artwork ? <Image source={{ uri: String(track.artwork) }} style={styles.coverImg} contentFit="cover" /> : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>{track.title ?? '재생 중'}</Text>
      <Pressable onPress={toggle} style={styles.btn} hitSlop={10}>
        <Icon name={playing ? 'pause.fill' : 'play.fill'} size={20} color={mono.color.text} />
      </Pressable>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // 풀폭·라운드 없음·탭바 위 밀착. 상단 헤어라인으로 피드와 구분.
  bar: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: mono.color.surface2,
    paddingVertical: 8, paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: mono.color.borderSoft,
  },
  // 커버 = 세로(3:4) — 브랜드 정체성(웹 파리티)
  cover: { width: 36, aspectRatio: 3 / 4, borderRadius: 6, backgroundColor: mono.color.surface, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  title: { flex: 1, color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
})
