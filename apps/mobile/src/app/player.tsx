import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import TrackPlayer, { State, useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player'
import { api } from '@/lib/api'
import { useNowPlaying } from '@/lib/now-playing'
import { mono } from '@/theme/mono'

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 전체 플레이어(now-playing) — 미니플레이어에서 확장. 커버/제목/진행바/재생 컨트롤.
export default function PlayerScreen() {
  const insets = useSafeAreaInsets()
  const track = useActiveTrack()
  const song = useNowPlaying()
  const playback = usePlaybackState()
  const { position, duration } = useProgress(500)

  const [liked, setLiked] = useState<boolean>(!!song?.liked)
  const [likeBusy, setLikeBusy] = useState(false)

  const playing = playback.state === State.Playing || playback.state === State.Buffering
  const pct = duration > 0 ? Math.min(1, position / duration) : 0

  const toggleLike = async () => {
    if (!song || likeBusy) return
    const next = !liked
    setLiked(next); setLikeBusy(true)
    try {
      const r = await api.post(`/api/songs/${song.id}/like`) as { liked?: boolean }
      if (typeof r.liked === 'boolean') setLiked(r.liked)
    } catch {
      setLiked(!next)
    } finally {
      setLikeBusy(false)
    }
  }

  if (!track) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.empty}>재생 중인 곡이 없어요</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.link}>닫기</Text></Pressable>
      </View>
    )
  }

  const seek = (dir: -1 | 1) => TrackPlayer.seekTo(Math.max(0, Math.min(duration || 0, position + dir * 10)))

  const lyrics = song?.lyrics?.trim()

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.chevron}>⌄</Text></Pressable>
        <Text style={styles.headerLabel}>재생 중</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.artWrap}>
        {track.artwork ? (
          <Image source={{ uri: String(track.artwork) }} style={styles.art} contentFit="cover" />
        ) : (
          <View style={[styles.art, styles.artPlaceholder]}><Text style={styles.artInitial}>♪</Text></View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{track.title ?? '제목 없음'}</Text>
        <Text style={styles.artist} numberOfLines={1}>{track.artist ?? '내 음악'}</Text>
      </View>

      <View style={styles.progress}>
        <View style={styles.track}><View style={[styles.fill, { width: `${pct * 100}%` }]} /></View>
        <View style={styles.times}>
          <Text style={styles.time}>{fmt(position)}</Text>
          <Text style={styles.time}>{fmt(duration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => seek(-1)} hitSlop={12}><Text style={styles.ctrlSecondary}>-10</Text></Pressable>
        <Pressable
          onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())}
          style={styles.playBtn}
        >
          <Text style={styles.playIcon}>{playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <Pressable onPress={() => seek(1)} hitSlop={12}><Text style={styles.ctrlSecondary}>+10</Text></Pressable>
      </View>

      {song ? (
        <Pressable onPress={toggleLike} disabled={likeBusy} style={styles.likeRow} hitSlop={8}>
          <Text style={[styles.like, liked && styles.likeOn]}>{liked ? '♥ 좋아요' : '♡ 좋아요'}</Text>
        </Pressable>
      ) : null}

      {lyrics ? (
        <View style={styles.lyricsWrap}>
          <Text style={styles.lyricsLabel}>가사</Text>
          <Text style={styles.lyrics}>{lyrics}</Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24, flex: 1 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body },
  link: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chevron: { color: mono.color.text, fontSize: 30, lineHeight: 30, width: 28 },
  headerLabel: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  artWrap: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  art: { width: '86%', aspectRatio: 1, borderRadius: mono.radius.xl, backgroundColor: mono.color.surface },
  artPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  artInitial: { color: mono.color.textTertiary, fontSize: 64 },
  info: { alignItems: 'center', gap: 6, marginBottom: 28 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '800', textAlign: 'center' },
  artist: { color: mono.color.textSecondary, fontSize: mono.font.body },
  progress: { marginBottom: 32 },
  track: { height: 4, borderRadius: 2, backgroundColor: mono.color.fillStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: mono.color.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { color: mono.color.textTertiary, fontSize: mono.font.tiny },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },
  ctrlSecondary: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '700' },
  playBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: mono.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { color: mono.color.text, fontSize: 26, fontWeight: '700' },
  likeRow: { alignItems: 'center', marginTop: 28 },
  like: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '700' },
  likeOn: { color: mono.color.danger },
  lyricsWrap: { marginTop: 36 },
  lyricsLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginBottom: 10 },
  lyrics: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 26 },
})
