import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import TrackPlayer, { State, useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player'
import { api } from '@/lib/api'
import { useNowPlaying } from '@/lib/now-playing'
import { setSongPublished, shareSong } from '@/lib/song-actions'
import { Icon } from '@/components/ui/icon'
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
  const [published, setPublished] = useState<boolean>(!!song?.published)
  const [pubBusy, setPubBusy] = useState(false)

  const playing = playback.state === State.Playing || playback.state === State.Buffering
  const pct = duration > 0 ? Math.min(1, position / duration) : 0

  // 영상 커버 — 완료된 videoCoverUrl 있으면 정지 이미지 대신 무음 루프 재생(오디오는 track-player).
  const videoUrl = song?.videoCoverStatus === 'done' ? song.videoCoverUrl ?? null : null
  const videoPlayer = useVideoPlayer(videoUrl, (p) => { p.loop = true; p.muted = true; if (videoUrl) p.play() })
  // 라이브러리(내) 곡만 영상 만들기 노출(공개곡은 username 있음)
  const isOwn = song ? !song.username : false

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

  const togglePublish = async () => {
    if (!song || pubBusy) return
    const next = !published
    setPublished(next); setPubBusy(true)
    const ok = await setSongPublished(song.id, next)
    if (!ok) setPublished(!next)
    setPubBusy(false)
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
        <Pressable onPress={() => router.back()} hitSlop={12}><Icon name="chevron.down" size={22} color={mono.color.textSecondary} /></Pressable>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.artWrap}>
        {videoUrl ? (
          <VideoView player={videoPlayer} style={styles.art} contentFit="cover" nativeControls={false} />
        ) : track.artwork ? (
          <Image source={{ uri: String(track.artwork) }} style={styles.art} contentFit="cover" />
        ) : (
          <View style={[styles.art, styles.artPlaceholder]}><Text style={styles.artInitial}>♪</Text></View>
        )}
        {song?.videoCoverStatus === 'generating' ? (
          <View style={styles.videoBadge}><Text style={styles.videoBadgeText}>영상 생성 중…</Text></View>
        ) : null}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{track.title ?? '제목 없음'}</Text>
        <Text
          style={[styles.artist, song?.username && styles.artistLink]}
          numberOfLines={1}
          onPress={song?.username ? () => { router.back(); router.push(`/creator/${song.username}`) } : undefined}
          suppressHighlighting
        >
          {track.artist ?? '내 음악'}
        </Text>
      </View>

      <View style={styles.progress}>
        <View style={styles.track}><View style={[styles.fill, { width: `${pct * 100}%` }]} /></View>
        <View style={styles.times}>
          <Text style={styles.time}>{fmt(position)}</Text>
          <Text style={styles.time}>{fmt(duration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => seek(-1)} hitSlop={12}><Icon name="gobackward.10" size={26} color={mono.color.textSecondary} /></Pressable>
        <Pressable
          onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())}
          style={styles.playBtn}
        >
          <Icon name={playing ? 'pause.fill' : 'play.fill'} size={26} color={mono.color.text} />
        </Pressable>
        <Pressable onPress={() => seek(1)} hitSlop={12}><Icon name="goforward.10" size={26} color={mono.color.textSecondary} /></Pressable>
      </View>

      {song ? (
        <View style={styles.actionsRow}>
          <Pressable onPress={toggleLike} disabled={likeBusy} style={styles.action} hitSlop={8}>
            <Icon name={liked ? 'heart.fill' : 'heart'} size={22} color={liked ? mono.color.danger : mono.color.textSecondary} />
            <Text style={styles.actionLabel}>좋아요</Text>
          </Pressable>
          {isOwn ? (
            <Pressable onPress={togglePublish} disabled={pubBusy} style={styles.action} hitSlop={8}>
              <Icon name={published ? 'globe' : 'lock'} size={22} color={published ? mono.color.accentLight : mono.color.textSecondary} />
              <Text style={styles.actionLabel}>{published ? '게시됨' : '게시'}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => shareSong(song.id, song.title)} style={styles.action} hitSlop={8}>
            <Icon name="square.and.arrow.up" size={22} color={mono.color.textSecondary} />
            <Text style={styles.actionLabel}>공유</Text>
          </Pressable>
          {isOwn ? (
            <Pressable onPress={() => router.push(`/video-create?songId=${song.id}`)} style={styles.action} hitSlop={8}>
              <Icon name="film" size={22} color={mono.color.textSecondary} />
              <Text style={styles.actionLabel}>영상</Text>
            </Pressable>
          ) : null}
        </View>
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
  art: { width: '86%', aspectRatio: 1, borderRadius: mono.radius.xl, backgroundColor: mono.color.surface, overflow: 'hidden' },
  videoBadge: {
    position: 'absolute', bottom: 12, left: '9%',
    backgroundColor: mono.color.overlayStrong, borderRadius: mono.radius.pill, paddingVertical: 6, paddingHorizontal: 12,
  },
  videoBadgeText: { color: mono.color.onMedia, fontSize: mono.font.tiny, fontWeight: '700' },
  artPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  artInitial: { color: mono.color.textTertiary, fontSize: 64 },
  info: { alignItems: 'center', gap: 6, marginBottom: 28 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '800', textAlign: 'center' },
  artist: { color: mono.color.textSecondary, fontSize: mono.font.body },
  artistLink: { color: mono.color.textSecondary, fontWeight: '600' },
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
  actionsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 28, paddingHorizontal: 12 },
  action: { alignItems: 'center', gap: 4, minWidth: 64 },
  actionText: { color: mono.color.textSecondary, fontSize: 22, fontWeight: '700' },
  actionLabel: { color: mono.color.textTertiary, fontSize: mono.font.tiny, fontWeight: '600' },
  likeOn: { color: mono.color.danger },
  pubOn: { color: mono.color.accentLight },
  lyricsWrap: { marginTop: 36 },
  lyricsLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginBottom: 10 },
  lyrics: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 26 },
})
