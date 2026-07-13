import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Extrapolation, interpolate, useAnimatedKeyboard, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import TrackPlayer, { State, useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player'
import { api } from '@/lib/api'
import { useNowPlaying } from '@/lib/now-playing'
import { setSongPublished, shareSong } from '@/lib/song-actions'
import { Icon } from '@/components/ui/icon'
import { SongCommentComposer, SongCommentList, useSongComments } from '@/components/ui/song-comments'
import { mono } from '@/theme/mono'

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 곡 리스트 행(song-row)과 동일 스펙 — 커버 54×72(3:4) + 상하 10
const HEADER_ROW = 92

// expo-blur 네이티브 모듈 감지(구 dev 빌드 폴백) — 미니플레이어와 동일 가드
const BLUR_AVAILABLE = requireOptionalNativeModule('ExpoBlur') != null

// 스크롤 연동 컴팩트 헤더 — 히어로(커버·제목)가 밖으로 나가면 리스트형(좌 커버 · 우 제목/아티스트)이 페이드인.
// collapsing-header 패턴이지만 중앙 타이틀 대신 곡 행 레이아웃이라 플레이어 전용.
function NowPlayingHeader({ scrollY, fadeStart, fadeEnd, cover, title, artist, topInset }: {
  scrollY: SharedValue<number>
  fadeStart: number
  fadeEnd: number
  cover: string | null
  title: string
  artist: string
  topInset: number
}) {
  const aStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP),
  }))
  return (
    <Animated.View pointerEvents="none" style={[styles.compactHeader, { paddingTop: topInset, height: topInset + HEADER_ROW }, aStyle]}>
      {/* 글래스모피즘 — 블러 배경이 흐릿하게 비침. 구 빌드는 불투명 폴백(미니플레이어 패턴) */}
      {BLUR_AVAILABLE ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={[styles.compactTint, !BLUR_AVAILABLE && styles.compactTintSolid]} pointerEvents="none" />
      {cover ? (
        <Image source={{ uri: cover }} style={styles.compactThumb} contentFit="cover" />
      ) : (
        <View style={[styles.compactThumb, styles.artPlaceholder]}><Text style={styles.compactThumbInitial}>♪</Text></View>
      )}
      <View style={styles.compactMeta}>
        <Text style={styles.compactTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.compactArtist} numberOfLines={1}>{artist}</Text>
      </View>
    </Animated.View>
  )
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
  // 가사·댓글 토글(웹 SongDetailPage 파리티) — 댓글은 공개 곡만
  const [tab, setTab] = useState<'lyrics' | 'comments'>('lyrics')
  // 웹 파리티: 댓글은 공개 곡만 (내 곡=published, 둘러보기 곡=username 존재)
  const canComment = !!song && (song.published || !!song.username)
  // 댓글 상태 — 목록(스크롤 내부)·입력창(하단 고정)이 나뉘어 렌더돼서 훅으로 공유
  const commentsState = useSongComments(song?.id ?? null, canComment && tab === 'comments')
  // 컴팩트 헤더 페이드 기준 — 제목(info) 블록의 콘텐츠 내 y를 onLayout으로 측정
  const [infoY, setInfoY] = useState(420)
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  // 하단 고정 입력 바 — absolute라 KAV padding이 안 먹혀서 키보드 높이를 직접 추적해 밀어올림.
  // 바 자체 paddingBottom(insets.bottom)만큼 겹침을 허용해 키보드 위 10px 간격 유지.
  const keyboard = useAnimatedKeyboard()
  const safeBottom = insets.bottom
  const composerBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.value - safeBottom) }],
  }))

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
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.empty}>재생 중인 곡이 없어요</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.link}>닫기</Text></Pressable>
      </View>
    )
  }

  const seek = (dir: -1 | 1) => TrackPlayer.seekTo(Math.max(0, Math.min(duration || 0, position + dir * 10)))

  const lyrics = song?.lyrics?.trim()

  const title = track.title ?? '제목 없음'
  const artist = track.artist ?? '내 음악'
  const coverThumb = song?.coverImage ?? (track.artwork ? String(track.artwork) : null)
  // 모달이라 상단 인셋이 거의 0 — 최소 여백 보장
  const topInset = Math.max(insets.top, 10)
  // 제목이 헤더 밑으로 사라질 즈음 페이드 완료
  const fadeEnd = Math.max(infoY - (topInset + HEADER_ROW), 60)
  const fadeStart = Math.max(fadeEnd - 60, 0)

  return (
    <View style={styles.root}>
      {/* 커버 색감을 흐릿하게 까는 배경(웹 파리티: scale 1.25 · blur · 70%) + 가독성 스크림 */}
      {coverThumb ? (
        <Image
          source={{ uri: coverThumb }}
          style={styles.bgBlur}
          contentFit="cover"
          blurRadius={50}
          transition={300}
          pointerEvents="none"
        />
      ) : null}
      <View style={styles.bgScrim} pointerEvents="none" />
    <Animated.ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 50, paddingBottom: insets.bottom + (tab === 'comments' && canComment ? 130 : 32), paddingHorizontal: 24 }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
    >
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

      <View style={styles.info} onLayout={(e) => setInfoY(e.nativeEvent.layout.y)}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text
          style={[styles.artist, song?.username && styles.artistLink]}
          numberOfLines={1}
          onPress={song?.username ? () => { router.back(); router.push(`/creator/${song.username}`) } : undefined}
          suppressHighlighting
        >
          {artist}
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
              <Text style={styles.actionLabel}>{published ? '공개' : '비공개'}</Text>
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

      {canComment ? (
        <View style={styles.tabRow}>
          {(['lyrics', 'comments'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabPill, tab === t && styles.tabPillOn]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'lyrics' ? '가사' : '댓글'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {canComment && tab === 'comments' ? (
        <SongCommentList state={commentsState} />
      ) : lyrics ? (
        <View style={canComment ? styles.tabBody : styles.lyricsWrap}>
          {!canComment ? <Text style={styles.lyricsLabel}>가사</Text> : null}
          <Text style={styles.lyrics}>{lyrics}</Text>
        </View>
      ) : canComment ? (
        <Text style={styles.lyricsEmpty}>가사가 없는 곡이에요</Text>
      ) : null}
    </Animated.ScrollView>

    <NowPlayingHeader
      scrollY={scrollY}
      fadeStart={fadeStart}
      fadeEnd={fadeEnd}
      cover={coverThumb}
      title={title}
      artist={artist}
      topInset={topInset}
    />

    {/* 모달 핸들 — 스크롤과 무관하게 최상단 고정(헤더 위) */}
    <View style={styles.handleFixed} pointerEvents="none"><View style={styles.handle} /></View>

    {/* 댓글 입력창 — 하단 고정 바(글래스), 댓글 탭에서만. 키보드 높이만큼 translateY로 따라 올라감 */}
    {canComment && tab === 'comments' ? (
      <Animated.View style={[styles.composerBar, { paddingBottom: insets.bottom + 10 }, composerBarStyle]}>
        {BLUR_AVAILABLE ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        <View style={[styles.compactTint, !BLUR_AVAILABLE && styles.compactTintSolid]} pointerEvents="none" />
        <SongCommentComposer state={commentsState} />
      </Animated.View>
    ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: mono.color.bg },
  // 배경 블러 커버 — 웹 SongDetailPage 파리티(scale 1.25 · blur-3xl · opacity 0.7 + bg/75 스크림)
  bgBlur: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ scale: 1.25 }], opacity: 0.7 },
  bgScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,19,24,0.75)' },
  container: { flex: 1, backgroundColor: 'transparent' },
  // 스크롤 컴팩트 헤더 — 리스트형 곡 행 (좌 커버 · 우 제목/아티스트)
  compactHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mono.color.borderSoft,
    overflow: 'hidden',
  },
  compactTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,22,28,0.35)' },
  compactTintSolid: { backgroundColor: mono.color.bg },
  // 썸네일·폰트 = 실제 리스트 행(song-row) 스펙
  compactThumb: { width: 54, aspectRatio: 3 / 4, borderRadius: mono.radius.sm, backgroundColor: mono.color.surface, overflow: 'hidden' },
  compactThumbInitial: { color: mono.color.textTertiary, fontSize: 22 },
  compactMeta: { flex: 1, minWidth: 0 },
  compactTitle: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  compactArtist: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24, flex: 1 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body },
  link: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700' },
  handleFixed: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 60 },
  // 하단 고정 댓글 입력 바 — 헤더와 같은 글래스 처리
  composerBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 55,
    paddingHorizontal: 20, paddingTop: 10, overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: mono.color.borderSoft,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: mono.color.fillStrong },
  artWrap: { alignItems: 'center', marginTop: 0, marginBottom: 28 },
  // 커버 = 세로(포스터형) — 브랜드 정체성(웹 파리티)
  art: { width: '68%', aspectRatio: 3 / 4, borderRadius: mono.radius.xl, backgroundColor: mono.color.surface, overflow: 'hidden' },
  videoBadge: {
    position: 'absolute', bottom: 12, left: '18%',
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
  tabBody: { marginTop: 0 },
  lyricsLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginBottom: 10 },
  lyrics: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 26 },
  lyricsEmpty: { color: mono.color.textTertiary, fontSize: mono.font.small, textAlign: 'center', marginTop: 8 },
  // 가사·댓글 토글 — 리스트 필터칩 사이즈 + 세그먼트 박스(공중에 뜨지 않게 묶음)
  tabRow: {
    flexDirection: 'row', alignSelf: 'center', marginTop: 36, marginBottom: 16,
    backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, padding: 4, gap: 4,
  },
  tabPill: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: mono.radius.pill },
  tabPillOn: { backgroundColor: '#ffffff' },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '600' },
  tabTextOn: { color: mono.color.bg, fontWeight: '700' },
})
