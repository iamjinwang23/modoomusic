import { useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import { requireOptionalNativeModule } from 'expo-modules-core'
import Svg, { Circle, Defs, G, Path, Mask, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg'
import MaskedView from '@react-native-masked-view/masked-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import TrackPlayer, { State, useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player'
import type { Song, UserProfile } from '@mono/shared'
import { api } from '@/lib/api'
import { useAuthGate } from '@/lib/auth-gate'
import { getNowPlaying, setNowPlaying, useNowPlaying } from '@/lib/now-playing'
import { supabase } from '@/lib/supabase'
import { primeMyDisplayName } from '@/lib/me'
import { deleteSong, downloadSong, setSongPublished, shareSong } from '@/lib/song-actions'
import { modelBadge } from '@/lib/generate'
import { isInAnyCollection } from '@/lib/collection'
import { SongMoreSheet } from '@/components/ui/song-more-sheet'
import { CollectionPickerModal } from '@/components/ui/collection-picker-modal'
import { SongEditModal } from '@/components/ui/song-edit-modal'
import { PublishSheet } from '@/components/ui/publish-sheet'
import { Icon } from '@/components/ui/icon'
import { GeneratingDots } from '@/components/ui/generating-dots'
import { hapticLight } from '@/lib/haptics'
import { SongCommentComposer, SongCommentList, useSongComments } from '@/components/ui/song-comments'
import { Marquee } from '@/components/ui/marquee'
import { GlassIconButton, GlassPill } from '@/components/ui/glass-button'
import { SeekBar } from '@/components/ui/seek-bar'
import { CoverScrim, formatCount } from '@/components/ui/profile-grid'
import { mono } from '@/theme/mono'
import { toast } from '@/lib/toast'
import { ToastHost } from '@/components/ui/toast-host'

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 슬림 네비바 — 좌 내리기 버튼 슬롯 + 작은 커버 + 제목/아티스트
const HEADER_ROW = 56

// 하단 블러 페이드 — BlurView 한 장을 세로 그라데이션 알파로 마스킹(위 투명→아래 불투명).
// 스트립 겹치기는 각 장 윗변이 하드 엣지라 경계가 남음 → 마스크로 완전 디졸브.
function BottomBlurFade({ height }: { height: number }) {
  return (
    <MaskedView
      style={[styles.bottomBlur, { height }]}
      maskElement={
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgGradient id="bBlurFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity="0" />
              <Stop offset="0.7" stopColor="#fff" stopOpacity="0.55" />
              <Stop offset="1" stopColor="#fff" stopOpacity="1" />
            </SvgGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#bBlurFade)" />
        </Svg>
      }
    >
      <BlurView intensity={44} tint="dark" style={styles.blurFull} />
    </MaskedView>
  )
}

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

// MingCute Play/Pause 채움 path(16×16) — 앱 아이콘과 동일 모양
const PLAY_FILL = 'M3.7793333333333328 3.173333333333333a0.9793333333333334 0.9793333333333334 0 0 1 1.3599999999999999 -0.7846666666666666c0.708 0.30266666666666664 2.2946666666666666 1.0219999999999998 4.308 2.1839999999999997 2.014 1.1626666666666665 3.4306666666666663 2.178 4.045999999999999 2.6386666666666665 0.5253333333333333 0.39399999999999996 0.5266666666666666 1.1753333333333331 0.0006666666666666666 1.5706666666666664 -0.6093333333333333 0.458 -2.0086666666666666 1.46 -4.046666666666667 2.6373333333333333 -2.04 1.1773333333333333 -3.6079999999999997 1.888 -4.309333333333333 2.1866666666666665 -0.604 0.258 -1.2799999999999998 -0.13333333333333333 -1.3586666666666665 -0.7846666666666666 -0.092 -0.7613333333333332 -0.264 -2.4899999999999998 -0.264 -4.824666666666666 0 -2.333333333333333 0.17133333333333334 -4.061333333333333 0.264 -4.823333333333333Z'
const PAUSE_FILL = 'M6 2a0.6666666666666666 0.6666666666666666 0 0 1 0.6666666666666666 0.6666666666666666v10.666666666666666a0.6666666666666666 0.6666666666666666 0 0 1 -0.6666666666666666 0.6666666666666666H4.666666666666666a0.6666666666666666 0.6666666666666666 0 0 1 -0.6666666666666666 -0.6666666666666666V2.6666666666666665a0.6666666666666666 0.6666666666666666 0 0 1 0.6666666666666666 -0.6666666666666666Zm5.333333333333333 0a0.6666666666666666 0.6666666666666666 0 0 1 0.6666666666666666 0.6666666666666666v10.666666666666666a0.6666666666666666 0.6666666666666666 0 0 1 -0.6666666666666666 0.6666666666666666h-1.3333333333333333a0.6666666666666666 0.6666666666666666 0 0 1 -0.6666666666666666 -0.6666666666666666V2.6666666666666665a0.6666666666666666 0.6666666666666666 0 0 1 0.6666666666666666 -0.6666666666666666Z'

// 재생/일시정지 — 화이트 원형에 MingCute 아이콘을 마스크로 뚫어(knockout) 뒤 배경이 비침.
// viewBox 16 기준: 원(cx8 cy8 r8) + 아이콘을 0.5배 축소·중앙(translate 4)해 컷아웃.
function PlayButton({ playing, onPress, size = 72 }: { playing: boolean; onPress: () => void; size?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Svg width={size} height={size} viewBox="0 0 16 16">
        <Defs>
          <Mask id="playKnockout">
            {/* white=보임, black=뚫림 */}
            <Circle cx="8" cy="8" r="8" fill="#fff" />
            <G transform="translate(4 4) scale(0.5)">
              <Path d={playing ? PAUSE_FILL : PLAY_FILL} fill="#000" />
            </G>
          </Mask>
        </Defs>
        <Circle cx="8" cy="8" r="8" fill="#fff" mask="url(#playKnockout)" />
      </Svg>
    </Pressable>
  )
}

// expo-clipboard는 네이티브 모듈 — 미포함 빌드(dev client·Build14)에선 로드만으로 크래시(dev는 try/catch로도
// 못 막음: Metro가 모듈 로드 실패를 별도로 빨간화면 보고). → require를 아예 하지 말고, expo-modules-core의
// 비파괴적 requireOptionalNativeModule로 네이티브 존재만 확인. 없으면 CopyBtn을 숨겨 require 자체를 회피.
const CLIPBOARD_AVAILABLE = !!requireOptionalNativeModule('ExpoClipboard')

// 복사 버튼(가사·스타일) — 탭 시 클립보드 복사 + '복사되었어요' 스낵바. 웹 CopyBtn 파리티.
// 네이티브 미포함(dev client·Build14)에선 렌더 안 함 → require 미실행 → 크래시 없음. Build 15에서 동작.
function CopyBtn({ text }: { text: string }) {
  if (!CLIPBOARD_AVAILABLE) return null
  return (
    <Pressable
      onPress={async () => {
        try {
          await (require('expo-clipboard') as { setStringAsync: (t: string) => Promise<boolean> }).setStringAsync(text)
          toast.success('복사되었어요')
        } catch { toast.error('복사에 실패했어요') }
      }}
      hitSlop={10}
      style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.55 }]}
    >
      <Icon name="copy" size={16} color={mono.color.textSecondary} />
    </Pressable>
  )
}

// 전체 플레이어(now-playing) — 미니플레이어에서 확장. 커버/제목/진행바/재생 컨트롤.
export default function PlayerScreen() {
  const insets = useSafeAreaInsets()
  const { requireAuth } = useAuthGate()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const track = useActiveTrack()
  const song = useNowPlaying()
  const playback = usePlaybackState()
  const { position, duration } = useProgress(500)

  const [liked, setLiked] = useState<boolean>(!!song?.liked)
  const [likeBusy, setLikeBusy] = useState(false)
  const likeTouchedRef = useRef(false)  // 사용자가 토글하면 true — fetch가 liked를 덮어쓰지 않게
  // 좋아요 팝 바운스 — 누르면 살짝 작아졌다 튀어오름(애플뮤직·인스타 하트 느낌)
  const likeScale = useSharedValue(1)
  const likeBounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: likeScale.value }] }))
  const [published, setPublished] = useState<boolean>(!!song?.published)
  const [pubBusy, setPubBusy] = useState(false)
  // 곡 통계(재생·좋아요·댓글 수) + 스타일 — 웹 파리티. 플레이어 진입 시 상세 조회.
  const [meta, setMeta] = useState<{ playCount: number; likeCount: number; commentCount: number } | null>(null)
  const [songStyle, setSongStyle] = useState<string | null>(null)
  const [songModel, setSongModel] = useState<string | null>(null)
  // 수정 모달 원본(제목·가사·공개코멘트) — 상세 fetch로 채움
  const [editData, setEditData] = useState<{ id: string; title: string | null; lyrics: string | null; publishComment: string | null; coverImage?: string; coverHue?: number } | null>(null)
  // 공개 코멘트 캡션 더보기/접기 — 3줄 초과 시 토글 노출
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [captionOverflow, setCaptionOverflow] = useState(false)
  const captionMeasured = useRef(false)
  // 스타일 더보기/접기 — 줄수/글자수 기준(측정 불안정 회피, 결정적)
  const [styleExpanded, setStyleExpanded] = useState(false)
  const styleOverflow = !!songStyle && (songStyle.split('\n').length > 5 || songStyle.length > 140)

  useEffect(() => {
    if (!song?.id) { setMeta(null); setSongStyle(null); setSongModel(null); setEditData(null); return }
    let active = true
    api.get(`/api/songs/${song.id}`).then((j) => {
      if (!active) return
      const s = (j as { song?: Song }).song
      if (!s) return
      setMeta({ playCount: s.playCount ?? 0, likeCount: s.likeCount ?? 0, commentCount: s.commentCount ?? 0 })
      setSongStyle(s.prompt?.trim() || [s.genre, s.mood].filter(Boolean).join(', ') || null)
      setSongModel(s.model ?? null)
      setEditData({ id: s.id, title: s.title ?? null, lyrics: s.lyrics ?? null, publishComment: s.publishComment ?? null, coverImage: s.coverImage, coverHue: s.coverHue })
      // 서버 per-user liked로 초기화 — 단, 사용자가 그 사이 토글했으면 스킵(race 방지)
      if (!likeTouchedRef.current) setLiked(!!s.liked)
    }).catch(() => {})
    return () => { active = false }
  }, [song?.id])

  // 곡이 바뀌면(이전/다음) 토글 플래그 리셋 + liked·published를 now-playing 값으로 즉시 동기화
  // (상세 fetch가 per-user liked로 곧 보정. song?.liked는 소스에 따라 부정확할 수 있음)
  useEffect(() => {
    likeTouchedRef.current = false
    setLiked(!!song?.liked)
    setPublished(!!song?.published)
    // 캡션 더보기 상태 리셋(곡마다 다시 측정), 스타일 접기 초기화
    captionMeasured.current = false
    setCaptionExpanded(false)
    setCaptionOverflow(false)
    setStyleExpanded(false)
  }, [song?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // 곡 주인(공개곡) 프로필 — 아바타·팔로우 (내 곡=username 없음이라 미노출)
  const [owner, setOwner] = useState<{ userId: string; avatarImage?: string; avatarHue: number; displayName: string } | null>(null)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  useEffect(() => {
    const uname = song?.username
    if (!uname) { setOwner(null); setFollowing(false); return }
    let active = true
    api.get(`/api/explore/profile/${uname}`).then((j) => {
      if (!active) return
      const p = (j as { profile?: UserProfile }).profile
      if (!p) return
      setOwner({ userId: p.userId, avatarImage: p.avatarImage, avatarHue: p.avatarHue, displayName: p.displayName })
      setFollowing(!!p.isFollowing)
    }).catch(() => {})
    return () => { active = false }
  }, [song?.username])

  // 내 곡(본인)일 때 내 프로필 — "내 음악" 대신 아바타+이름 노출
  const [myProfile, setMyProfile] = useState<{ username: string; displayName: string; avatarImage: string | null; avatarHue: number } | null>(null)
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active || !user) { setMyProfile(null); return }
      const { data } = await supabase.from('profiles').select('username, display_name, avatar_url, avatar_hue').eq('id', user.id).maybeSingle()
      const p = data as { username?: string; display_name?: string | null; avatar_url?: string | null; avatar_hue?: number | null } | null
      if (active && p?.username) {
        const dn = p.display_name || p.username
        setMyProfile({ username: p.username, displayName: dn, avatarImage: p.avatar_url ?? null, avatarHue: p.avatar_hue ?? 250 })
        primeMyDisplayName(dn)
      }
    })()
    return () => { active = false }
  }, [])

  const toggleFollow = async () => {
    if (!owner || followBusy || !requireAuth()) return
    const next = !following
    setFollowing(next); setFollowBusy(true)
    try {
      const r = await api.post(`/api/profiles/${owner.userId}/follow`) as { following?: boolean }
      if (typeof r.following === 'boolean') setFollowing(r.following)
    } catch {
      setFollowing(!next)
    } finally {
      setFollowBusy(false)
    }
  }
  // 웹 파리티: 댓글은 공개 곡만 (내 곡=published, 둘러보기 곡=username 존재)
  const canComment = !!song && (song.published || !!song.username)
  // 댓글은 우측 레일 → 바텀시트 모달. 딤 페이드 + 시트 슬라이드업(분리, AI가사 모달 패턴)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsMounted, setCommentsMounted] = useState(false)
  const sheetAnim = useSharedValue(0)
  useEffect(() => {
    if (commentsOpen) {
      setCommentsMounted(true)
      sheetAnim.value = withTiming(1, { duration: 240 })
    } else if (commentsMounted) {
      sheetAnim.value = withTiming(0, { duration: 200 }, (f) => { if (f) runOnJS(setCommentsMounted)(false) })
    }
  }, [commentsOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  const sheetDimStyle = useAnimatedStyle(() => ({ opacity: sheetAnim.value }))
  const sheetSlideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(sheetAnim.value, [0, 1], [screenH * 0.82, 0]) }] }))
  const commentsState = useSongComments(song?.id ?? null, canComment && commentsOpen)
  // 컴팩트 헤더 페이드 기준 — 제목(info) 블록의 콘텐츠 내 y를 onLayout으로 측정
  const [infoY, setInfoY] = useState(420)
  const [seeking, setSeeking] = useState(false) // 시크바 드래그 중엔 스크롤 끔(제스처 뺏김 방지)
  // 큐 위치 — 첫곡/끝곡에서 이전/다음 버튼 비활성화(흐리게)용
  const [queueInfo, setQueueInfo] = useState({ index: 0, len: 0 })
  useEffect(() => {
    let alive = true
    Promise.all([TrackPlayer.getActiveTrackIndex(), TrackPlayer.getQueue()])
      .then(([i, q]) => { if (alive) setQueueInfo({ index: typeof i === 'number' ? i : 0, len: q?.length ?? 0 }) })
      .catch(() => {})
    return () => { alive = false }
  }, [track])
  // 이전 버튼은 항상 활성(현재 곡 처음으로 되감기 로직이 있어 첫곡에서도 기능함). 다음만 끝곡에서 비활성.
  const hasNext = queueInfo.len > 0 && queueInfo.index < queueInfo.len - 1
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  // 고정 커버(이미지·영상 동일) — 콘텐츠가 위로 스크롤될수록 어두워짐. 마스크 불필요 → 영상도 동일 UI.
  const coverH = Math.round(screenW * (4 / 3))
  const coverDarkenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, coverH * 0.55], [0, 0.92], Extrapolation.CLAMP),
  }))
  // 좌우 스와이프 = 이전/다음 곡(즉시 전환). activeOffsetX·failOffsetY로 세로 스크롤과 공존.
  const swipe = useRef(
    Gesture.Pan()
      .activeOffsetX([-18, 18])
      .failOffsetY([-14, 14])
      .runOnJS(true)
      .onEnd((e) => {
        if (e.translationX <= -55) TrackPlayer.skipToNext().catch(() => {})
        else if (e.translationX >= 55) TrackPlayer.skipToPrevious().catch(() => {})
      }),
  ).current
  // 틱톡식 첫 화면 — 뷰포트 높이를 재서 히어로(제목~토글)를 하단 앵커, 빈 공간 없이 꽉 채움
  const [viewportH, setViewportH] = useState(0)

  const playing = playback.state === State.Playing || playback.state === State.Buffering

  // 영상 커버 — 완료된 videoCoverUrl 있으면 정지 이미지 대신 무음 루프 재생(오디오는 track-player).
  const videoUrl = song?.videoCoverStatus === 'done' ? song.videoCoverUrl ?? null : null
  const videoPlayer = useVideoPlayer(videoUrl, (p) => { p.loop = true; p.muted = true; if (videoUrl) p.play() })
  // 라이브러리(내) 곡만 영상 만들기 노출(공개곡은 username 있음)
  // 내 곡 = username 없음(라이브러리) 또는 공개곡인데 내 username과 일치
  const isMine = !!song && (!song.username || song.username === myProfile?.username)
  const isOwn = isMine

  const toggleLike = async () => {
    if (!song || likeBusy || !requireAuth()) return
    likeTouchedRef.current = true
    const next = !liked
    // 딱 한 번 뿅 — 커졌다 원위치(timing만, 스프링 흔들림 없이)
    hapticLight()
    likeScale.value = withSequence(
      withTiming(1.2, { duration: 100, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
    )
    setLiked(next)
    setMeta((m) => m ? { ...m, likeCount: Math.max(0, m.likeCount + (next ? 1 : -1)) } : m)
    setLikeBusy(true)
    try {
      const r = await api.post(`/api/songs/${song.id}/like`) as { liked?: boolean; likeCount?: number }
      // 서버 권위값으로 확정 — liked 방향·카운트 드리프트 보정
      if (typeof r.liked === 'boolean') setLiked(r.liked)
      if (typeof r.likeCount === 'number') setMeta((m) => m ? { ...m, likeCount: r.likeCount! } : m)
    } catch {
      setLiked(!next)
      setMeta((m) => m ? { ...m, likeCount: Math.max(0, m.likeCount + (next ? -1 : 1)) } : m)
    } finally {
      setLikeBusy(false)
    }
  }

  const togglePublish = async () => {
    if (!song || pubBusy) return
    // 공개: 코멘트 입력 시트를 통해 발행(웹 PublishModal 패리티). 공개 취소: 즉시.
    if (!published) { setPublishOpen(true); return }
    setPublished(false); setPubBusy(true)
    const ok = await setSongPublished(song.id, false)
    if (ok) toast.info('공개가 취소되었어요')
    else { setPublished(true); toast.error('처리에 실패했어요') }
    setPubBusy(false)
  }

  // 더보기(⋮) 바텀시트 + 수정 모달 + 컬렉션 상태
  const [moreOpen, setMoreOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [collected, setCollected] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => { if (song?.id) isInAnyCollection(song.id).then(setCollected); else setCollected(false) }, [song?.id])

  // 시트 닫힌 뒤(300ms) 호출됨 — 컬렉션 담기 모달 오픈
  const onCollect = () => setPickerOpen(true)
  const onDownload = async () => {
    if (!song?.audioUrl) return
    const ok = await downloadSong(song.audioUrl, song.title)
    if (!ok) toast.error('다운로드에 실패했어요')
  }
  const onDelete = () => {
    if (!song) return
    Alert.alert('곡을 삭제할까요?', song.title?.trim() || '제목 없음', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { const ok = await deleteSong(song.id); if (ok) { toast.info('곡이 삭제되었어요'); router.back() } else toast.error('삭제에 실패했어요') } },
    ])
  }
  const REPORT_REASONS = ['욕설·비속어', '음란물', '혐오·차별 표현', '도배', '광고·홍보성 콘텐츠', '개인정보 노출', '저작권 침해', '기타']
  const onReport = () => {
    if (!song) return
    const run = async (reason: string) => { try { await api.post(`/api/songs/${song.id}/report`, { reason }); toast.success('신고가 접수되었어요') } catch { toast.error('처리에 실패했어요') } }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...REPORT_REASONS, '취소'], cancelButtonIndex: REPORT_REASONS.length, title: '신고 사유' }, (i) => { if (i < REPORT_REASONS.length) run(REPORT_REASONS[i]) })
    } else {
      Alert.alert('신고 사유', undefined, [...REPORT_REASONS.map((r) => ({ text: r, onPress: () => run(r) })), { text: '취소', style: 'cancel' as const }])
    }
  }

  if (!track) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.empty}>재생 중인 곡이 없어요</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.link}>닫기</Text></Pressable>
      </View>
    )
  }

  // 전 곡 / 다음 곡 (웹 파리티) — 큐 경계면 무시
  // 이전 곡 버튼 — 표준 플레이어 동작(애플뮤직·스포티파이): 3초 넘게 재생됐으면 현재 곡 처음으로,
  // 3초 이내면 이전 곡으로. 재생 위치를 신선하게 읽어 판정.
  const skipPrev = async () => {
    try {
      const pos = await TrackPlayer.getPosition()
      if (pos > 3) await TrackPlayer.seekTo(0)
      else await TrackPlayer.skipToPrevious()
    } catch {}
  }
  const skipNext = async () => { try { await TrackPlayer.skipToNext() } catch {} }

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
    <GestureHandlerRootView style={styles.root}>
      {/* 커버 색감을 흐릿하게 까는 배경(웹 파리티: scale 1.25 · blur · 70%) + 가독성 스크림 */}
      {coverThumb ? (
        <Image
          source={{ uri: coverThumb }}
          style={styles.bgBlur}
          contentFit="cover"
          blurRadius={50}
          cachePolicy="memory-disk"
          pointerEvents="none"
        />
      ) : null}
      <View style={styles.bgScrim} pointerEvents="none" />

    {/* 고정 커버(이미지·영상 동일) — 화면 전체. 콘텐츠 스크롤 시 어두워짐 */}
    <View style={styles.coverFixed} pointerEvents="none">
      {videoUrl ? (
        <VideoView player={videoPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : coverThumb ? (
        <Image source={{ uri: coverThumb }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.artPlaceholder]}><Text style={styles.artInitial}>♪</Text></View>
      )}
      {/* 하단 블러 — 마스크로 위쪽이 완전히 사라져 경계 없음 */}
      {BLUR_AVAILABLE ? <BottomBlurFade height={320} /> : null}
      {/* 상시 하단 그라데이션 — 정지 상태에서도 하단 컨트롤 가독성 */}
      <CoverScrim />
      {/* 스크롤 연동 딤 — 배경 톤으로 어두워져 가사·댓글 가독성 확보 */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.coverDarken, coverDarkenStyle]} />
    </View>

    <Animated.ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: 0, paddingBottom: insets.bottom + 40, paddingHorizontal: 24 }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      scrollEnabled={!seeking}
      keyboardShouldPersistTaps="handled"
      onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
    >
      {/* 첫 화면 = 뷰포트 높이(틱톡식) — 커버 영역(빈 공간) + 히어로 콘텐츠(하단 앵커) */}
      <View style={viewportH ? { height: viewportH, justifyContent: 'flex-end', paddingBottom: 8 } : null}>
      {/* 커버 스와이프 영역 = 첫 화면 전체(콘텐츠 뒤). 좌우=이전/다음 곡, 세로=스크롤 통과. 버튼은 위에 있어 그대로 탭.
          시크바는 이 뷰포트 아래(별도 섹션)라 겹치지 않고, 시크바 자체가 잡은 제스처를 놓지 않음(절대추적). */}
      <GestureDetector gesture={swipe}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      {song?.videoCoverStatus === 'generating' ? (
        <View style={styles.videoGenOverlay} pointerEvents="none">
          <View style={styles.videoGenCard}>
            {BLUR_AVAILABLE ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
            <View style={[styles.videoGenTint, !BLUR_AVAILABLE && styles.videoGenTintSolid]} pointerEvents="none" />
            <GeneratingDots label="영상을 만들고 있어요" labelColor={mono.color.onMedia} onDark />
          </View>
        </View>
      ) : null}

      {/* 캡션(좌) + 세로 액션 레일(우) — 틱톡/쇼츠식 */}
      <View style={styles.heroRow} onLayout={(e) => setInfoY(e.nativeEvent.layout.y)}>
        <View style={styles.info}>
          {(() => { const b = modelBadge(songModel); return b ? <Text style={[styles.modelBadge, { color: b.color, backgroundColor: b.bg }]}>{b.label}</Text> : null })()}
          <Marquee text={title} style={styles.title} />
          {song?.username ? (
            <View style={styles.ownerRow}>
              <Pressable style={styles.ownerLeft} onPress={() => { router.back(); router.push(`/creator/${song.username}`) }} hitSlop={6}>
                <View style={styles.ownerAvatar}>
                  {owner?.avatarImage ? (
                    <Image source={{ uri: owner.avatarImage }} style={styles.ownerAvatarImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.ownerAvatarImg, styles.ownerAvatarFallback, { backgroundColor: `hsl(${owner?.avatarHue ?? 250}, 40%, 40%)` }]}>
                      <Text style={styles.ownerAvatarInitial}>{(artist.trim().charAt(0) || '?').toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.ownerName} numberOfLines={1}>{artist}</Text>
              </Pressable>
              {owner && !isMine ? (
                <GlassPill onPress={toggleFollow} disabled={followBusy} style={[styles.followBtn, followBusy && styles.dim]}>
                  <Icon name={following ? 'following' : 'follow'} size={14} color={mono.color.onMedia} />
                  <Text style={styles.followText}>{following ? '팔로잉' : '팔로우'}</Text>
                </GlassPill>
              ) : null}
            </View>
          ) : isOwn && myProfile ? (
            <Pressable style={styles.ownerLeft} onPress={() => { router.back(); router.push(`/creator/${myProfile.username}`) }} hitSlop={6}>
              <View style={styles.ownerAvatar}>
                {myProfile.avatarImage ? (
                  <Image source={{ uri: myProfile.avatarImage }} style={styles.ownerAvatarImg} contentFit="cover" />
                ) : (
                  <View style={[styles.ownerAvatarImg, styles.ownerAvatarFallback, { backgroundColor: `hsl(${myProfile.avatarHue}, 40%, 40%)` }]}>
                    <Text style={styles.ownerAvatarInitial}>{(myProfile.displayName.trim().charAt(0) || '?').toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.ownerName} numberOfLines={1}>{myProfile.displayName}</Text>
            </Pressable>
          ) : (
            <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
          )}
          {/* 공개 코멘트(캡션) — 릴스식, 프로필 하단. 3줄 넘으면 더보기/접기 토글 */}
          {editData?.publishComment?.trim() ? (
            <Pressable onPress={() => captionOverflow && setCaptionExpanded((v) => !v)}>
              {/* 숨겨진 측정용 — numberOfLines 없이 실제 줄 수 측정(잘린 Text로는 초과 판정 불가) */}
              {!captionMeasured.current ? (
                <Text
                  style={[styles.caption, styles.captionMeasure]}
                  onTextLayout={(e) => { captionMeasured.current = true; setCaptionOverflow(e.nativeEvent.lines.length > 3) }}
                >
                  {editData.publishComment.trim()}
                </Text>
              ) : null}
              <Text style={styles.caption} numberOfLines={captionExpanded ? undefined : 3}>
                {editData.publishComment.trim()}
              </Text>
              {captionOverflow ? (
                <Text style={styles.captionMore}>{captionExpanded ? '접기' : '더보기'}</Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>

        {song ? (
          <View style={styles.rail}>
            <View style={styles.railItem}>
              <GlassIconButton name="play.fill" size={48} iconSize={22} />
              <Text style={styles.railCount}>{formatCount(meta?.playCount ?? 0)}</Text>
            </View>
            <View style={styles.railItem}>
              <Animated.View style={likeBounceStyle}>
                {liked ? (
                  <Pressable onPress={toggleLike} disabled={likeBusy} style={styles.likeOn}>
                    <Icon name="heart.fill" size={24} color={mono.color.bg} />
                  </Pressable>
                ) : (
                  <GlassIconButton name="heart" size={48} iconSize={24} color={mono.color.text} onPress={toggleLike} disabled={likeBusy} />
                )}
              </Animated.View>
              <Text style={styles.railCount}>{formatCount(meta?.likeCount ?? 0)}</Text>
            </View>
            <View style={styles.railItem}>
              <GlassIconButton name="bubble.left" size={48} iconSize={23} onPress={() => { if (!requireAuth()) return; canComment ? setCommentsOpen(true) : Alert.alert('비공개 곡엔 댓글을 남길 수 없어요') }} />
              <Text style={styles.railCount}>{formatCount(meta?.commentCount ?? 0)}</Text>
            </View>
            <View style={styles.railItem}>
              <GlassIconButton name="square.and.arrow.up" size={48} iconSize={21} onPress={() => shareSong(song.id, song.title)} />
              <Text style={styles.railCount}>공유</Text>
            </View>
            <GlassIconButton name="ellipsis" size={48} iconSize={21} onPress={() => setMoreOpen(true)} />
          </View>
        ) : null}
      </View>

      <View style={styles.progress}>
        <SeekBar position={position} duration={duration} height={4} hitVertical={14} color="#ffffff" trackColor="rgba(255,255,255,0.24)" onActiveChange={setSeeking} />
        <View style={styles.times}>
          <Text style={styles.time}>{fmt(position)}</Text>
          <Text style={styles.time}>{fmt(duration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={skipPrev} hitSlop={12}><Icon name="gobackward.10" size={30} color={mono.color.text} /></Pressable>
        <PlayButton playing={playing} onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())} />
        <Pressable onPress={skipNext} disabled={!hasNext} hitSlop={12} style={!hasNext && styles.ctrlDisabled}><Icon name="goforward.10" size={30} color={mono.color.text} /></Pressable>
      </View>

      </View>

      {/* 스타일 — 5줄 초과 시 더보기/접기 */}
      {songStyle ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>스타일</Text>
            <CopyBtn text={songStyle} />
          </View>
          <Pressable onPress={() => styleOverflow && setStyleExpanded((v) => !v)}>
            <Text style={styles.sectionBody} numberOfLines={styleExpanded ? undefined : 5}>{songStyle}</Text>
            {styleOverflow ? (
              <Text style={styles.styleMore}>{styleExpanded ? '접기' : '더보기'}</Text>
            ) : null}
          </Pressable>
        </View>
      ) : null}

      {/* 가사 */}
      {lyrics ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>가사</Text>
            <CopyBtn text={lyrics} />
          </View>
          <Text style={styles.lyrics}>{lyrics}</Text>
        </View>
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

    {/* 내리기 버튼 — 좌상단, 슬림 헤더의 왼쪽 요소와 정렬(항상 보임) */}
    <GlassIconButton name="chevron.down" iconSize={22} onPress={() => router.back()} style={[styles.downBtn, { top: topInset + 10 }]} />

    {/* 댓글 — 딤 페이드 + 시트 슬라이드업(분리, AI가사 모달 패턴) */}
    <Modal visible={commentsMounted} transparent animationType="none" onRequestClose={() => setCommentsOpen(false)}>
      <View style={styles.sheetRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.sheetDim, sheetDimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCommentsOpen(false)} />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetKav}>
          <Animated.View style={[styles.sheet, sheetSlideStyle, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>댓글 {formatCount(meta?.commentCount ?? 0)}</Text>
              <Pressable onPress={() => setCommentsOpen(false)} hitSlop={8}><Icon name="close" size={22} color={mono.color.textSecondary} /></Pressable>
            </View>
            <ScrollView style={styles.sheetList} contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <SongCommentList state={commentsState} />
            </ScrollView>
            <SongCommentComposer state={commentsState} />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    {/* 더보기(⋮) 바텀시트 — 웹 SongMoreMenu 파리티 */}
    <SongMoreSheet
      open={moreOpen}
      onClose={() => setMoreOpen(false)}
      isOwner={isOwn}
      published={published}
      collected={collected}
      onCollect={onCollect}
      onPublishToggle={togglePublish}
      onDownload={onDownload}
      onVideoCover={() => song && router.push(`/video-create?songId=${song.id}${song.coverImage ? `&cover=${encodeURIComponent(song.coverImage)}` : ''}`)}
      onEdit={() => setEditOpen(true)}
      onDelete={onDelete}
      onReport={onReport}
    />

    {/* 곡 수정 모달 */}
    <SongEditModal
      open={editOpen}
      onClose={() => setEditOpen(false)}
      song={editData}
      onSaved={(p) => {
        setEditData((d) => d ? { ...d, ...p } : d)
        const cur = getNowPlaying()
        if (cur && cur.id === editData?.id) setNowPlaying({ ...cur, title: p.title, lyrics: p.lyrics, coverImage: p.coverImage ?? cur.coverImage })
      }}
    />

    {/* 공개하기 — 코멘트 입력 후 발행 */}
    <PublishSheet
      open={publishOpen}
      onClose={() => setPublishOpen(false)}
      song={song ? { id: song.id, title: song.title, publishComment: editData?.publishComment ?? null, coverImage: song.coverImage, coverHue: editData?.coverHue } : null}
      onPublished={(c) => {
        setPublished(true)
        setEditData((d) => d ? { ...d, publishComment: c } : d)
        const cur = getNowPlaying()
        if (cur && cur.id === song?.id) setNowPlaying({ ...cur, published: true })
      }}
    />

    {/* 컬렉션에 담기 모달 */}
    <CollectionPickerModal
      open={pickerOpen}
      song={song}
      onClose={() => { setPickerOpen(false); if (song?.id) isInAnyCollection(song.id).then(setCollected) }}
    />
    {/* 스낵바 — 노래 상세는 네이티브 모달이라 루트 ToastHost가 가려짐. 이 화면 VC 안에도 마운트해 위에 표시. */}
    <ToastHost />
    </GestureHandlerRootView>
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
    // paddingLeft = 내리기 버튼(왼쪽16·너비36) 슬롯 확보 → 커버가 버튼 오른쪽에서 시작
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 60, paddingRight: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mono.color.borderSoft,
    overflow: 'hidden',
  },
  compactTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,22,28,0.35)' },
  compactTintSolid: { backgroundColor: mono.color.bg },
  // 슬림 네비바용 작은 커버
  compactThumb: { width: 32, aspectRatio: 3 / 4, borderRadius: mono.radius.sm, backgroundColor: mono.color.surface, overflow: 'hidden' },
  compactThumbInitial: { color: mono.color.textTertiary, fontSize: 16 },
  compactMeta: { flex: 1, minWidth: 0 },
  compactTitle: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  compactArtist: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24, flex: 1 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body },
  link: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700' },
  // 내리기 버튼 — 좌상단 원형(핸들 대체). 크기·모양은 GlassIconButton 기본
  downBtn: { position: 'absolute', left: 16, zIndex: 60 },
  // 고정 커버 — 화면 전체(풀스크린), ScrollView 뒤에 절대배치
  coverFixed: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: mono.color.surface, overflow: 'hidden' },
  // 스크롤 딤 — 배경 스크림과 동일 계열 톤
  coverDarken: { backgroundColor: '#111318' },
  // 하단 블러(마스크 페이드)
  bottomBlur: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  blurFull: { width: '100%', height: '100%' },
  // 영상 생성 중 — 화면 중앙 오버레이(가사 생성 중과 동일 톤: 그라데이션 dots + 문구)
  videoGenOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: '45%' },
  videoGenCard: { borderRadius: mono.radius.lg, paddingVertical: 24, paddingHorizontal: 32, overflow: 'hidden' },
  videoGenTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  videoGenTintSolid: { backgroundColor: 'rgba(0,0,0,0.55)' },
  artPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  artInitial: { color: mono.color.textTertiary, fontSize: 64 },
  // 캡션(좌) + 세로 레일(우) — 레일 바닥을 캡션 바닥에 맞춤
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 24 },
  // 제목·아티스트 좌측 정렬 (레일 폭만큼 우측 여백)
  info: { flex: 1, alignItems: 'flex-start', gap: 12, paddingRight: 12 },
  // 세로 액션 레일 (재생·좋아요·댓글·공유·더보기) — 글래스 딤 원형 + 카운트
  rail: { alignItems: 'center', gap: 16, paddingLeft: 4 },
  railItem: { alignItems: 'center', gap: 5 },
  railCount: { color: mono.color.text, fontSize: mono.font.tiny, fontWeight: '700' },
  // 좋아요 활성 — 화이트 원형 + 다크 하트(컬러 반전, 글래스보다 돋보이게)
  likeOn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  title: { color: mono.color.text, fontSize: 28, fontWeight: '700', lineHeight: 34 },
  // 모델 뱃지 — 제목 위, 2.6=바이올렛 / 3.0=틸(색상은 inline). alignSelf로 좌측 정렬.
  modelBadge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, overflow: 'hidden' },
  artist: { color: mono.color.textSecondary, fontSize: mono.font.body },
  // 공개 코멘트 캡션(릴스식) — 프로필 하단
  caption: { color: mono.color.text, fontSize: mono.font.body, lineHeight: 26 },
  captionMore: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '700', marginTop: 3 },
  styleMore: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700', marginTop: 3 },
  // 측정 전용 — 실제 줄 수만 재고 화면엔 안 보이게(absolute+투명)
  captionMeasure: { position: 'absolute', opacity: 0, left: 0, right: 0 },
  // 곡 주인 행 — 아바타 + 이름 + 팔로우(이름 바로 옆)
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ownerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 },
  ownerAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  ownerAvatarImg: { width: '100%', height: '100%' },
  ownerAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  ownerAvatarInitial: { color: mono.color.onMedia, fontSize: 14, fontWeight: '800' },
  ownerName: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', flexShrink: 1 },
  // 웹: bg-white/8 · rounded-full · px4 py2
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, height: 40,
    borderRadius: mono.radius.pill,
  },
  followText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '600' },
  dim: { opacity: 0.5 },
  progress: { marginBottom: 16 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  time: { color: mono.color.text, fontSize: mono.font.tiny },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, marginBottom: 40 },
  ctrlDisabled: { opacity: 0.3 }, // 첫곡/끝곡 — 이전/다음 없음
  ctrlSecondary: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '700' },
  playBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: mono.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { color: mono.color.text, fontSize: 26, fontWeight: '700' },
  // 웹 파리티 액션 행 — 알약 통계(재생·좋아요·댓글) + 원형(공유·더보기)
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14,
    borderRadius: mono.radius.pill, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statPillOn: { backgroundColor: '#ffffff' },
  statPillText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  statPillTextOn: { color: mono.color.bg, fontWeight: '700' },
  circleAct: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // 스타일·가사 섹션
  section: { marginTop: 32 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  copyBtn: { padding: 4, marginRight: -4 },
  sectionBody: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 24 },
  lyrics: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 26 },
  // 댓글 바텀시트 모달
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetDim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetKav: { justifyContent: 'flex-end' },
  sheet: {
    height: '78%', backgroundColor: mono.color.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: mono.color.fillStrong, marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  sheetTitle: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  sheetList: { flex: 1 },
})
