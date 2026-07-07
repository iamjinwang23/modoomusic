import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import TrackPlayer, { State, useActiveTrack, usePlaybackState } from 'react-native-track-player'
import { Image } from 'expo-image'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 하단 미니 플레이어 — 현재 트랙·재생상태. 트랙 없으면 숨김. 탭바 위 고정.
export function MiniPlayer() {
  const insets = useSafeAreaInsets()
  const track = useActiveTrack()
  const playback = usePlaybackState()
  if (!track) return null

  const playing = playback.state === State.Playing || playback.state === State.Buffering
  const toggle = () => (playing ? TrackPlayer.pause() : TrackPlayer.play())

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
      <Pressable style={styles.bar} onPress={() => router.push('/player')}>
        <View style={styles.cover}>
          {track.artwork ? <Image source={{ uri: String(track.artwork) }} style={styles.coverImg} contentFit="cover" /> : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>{track.title ?? '재생 중'}</Text>
        <Pressable onPress={toggle} style={styles.btn} hitSlop={10}>
          <Icon name={playing ? 'pause.fill' : 'play.fill'} size={18} color={mono.color.text} />
        </Pressable>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 56, paddingHorizontal: 12 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: mono.color.surface2, borderRadius: mono.radius.md,
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  cover: { width: 40, height: 40, borderRadius: 6, backgroundColor: mono.color.surface, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  title: { flex: 1, color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: mono.color.text, fontSize: 16 },
})
