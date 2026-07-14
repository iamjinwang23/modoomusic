import { useEffect, useState } from 'react'
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import TrackPlayer, { State, useActiveTrack, usePlaybackState } from 'react-native-track-player'
import type { CommunityPost, CommunityPoll } from '@mono/shared'
import { api } from '@/lib/api'
import { useSession } from '@/lib/use-session'
import { useAuthGate } from '@/lib/auth-gate'
import { setSelectedPost } from '@/lib/selected-post'
import { playSong } from '@/lib/player'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

const REPORT_REASONS = ['욕설·비속어', '음란물', '혐오·차별 표현', '도배', '광고·홍보성 콘텐츠', '개인정보 노출', '저작권 침해', '기타']

function initial(name: string | null): string {
  return (name?.trim().charAt(0) || '?').toUpperCase()
}

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}일 전` : `${Math.floor(d / 7)}주 전`
}

function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : null
}

function youTubeThumb(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    let vid: string | null = null
    if (u.hostname.includes('youtube.com')) vid = u.searchParams.get('v')
    else if (u.hostname === 'youtu.be') vid = u.pathname.slice(1).split('?')[0]
    return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null
  } catch { return null }
}

// 게시글 카드 — 작성자·시간·본문·다중이미지·곡/유튜브/링크 임베드·투표·좋아요·댓글. 박스 없이 라인 구분(웹 파리티).
export function PostCard({ post, managerId, canInteract = true, onPress, onAuthorPress, onChanged }: {
  post: CommunityPost
  managerId?: string | null
  canInteract?: boolean
  onPress?: () => void
  onAuthorPress?: () => void
  onChanged?: () => void
}) {
  const { session } = useSession()
  const { requireAuth } = useAuthGate()
  const myId = session?.user?.id
  const isAuthor = !!myId && post.authorId === myId
  const isMgr = !!myId && !!managerId && managerId === myId
  const [liked, setLiked] = useState(!!post.liked)
  const [likeCount, setLikeCount] = useState(post.likeCount)
  const [busy, setBusy] = useState(false)
  const [poll, setPoll] = useState<CommunityPoll | null>(post.poll ?? null)
  const [pollBusy, setPollBusy] = useState(false)
  const [og, setOg] = useState<{ image?: string; title?: string } | null>(null)
  // 임베드 곡 재생 상태 — 현재 이 곡이 재생 중이면 pause 아이콘
  const activeTrack = useActiveTrack()
  const playback = usePlaybackState()
  const songIsActive = !!post.song && activeTrack?.id === post.song.id
  const songPlaying = songIsActive && (playback.state === State.Playing || playback.state === State.Buffering)

  const isManager = !!managerId && post.authorId === managerId
  const images = post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : [])
  const embedUrl = post.linkUrl || firstUrl(post.content)
  const ytThumb = youTubeThumb(embedUrl)

  // OG 링크 미리보기 — 직접 이미지·YT·곡 없고 링크만 있을 때
  useEffect(() => {
    if (!embedUrl || ytThumb || images.length > 0 || post.song) return
    let alive = true
    api.get(`/api/og?url=${encodeURIComponent(embedUrl)}`)
      .then((d) => { const r = d as { image?: string; title?: string }; if (alive && r?.image) setOg({ image: r.image, title: r.title }) })
      .catch(() => {})
    return () => { alive = false }
  }, [embedUrl])

  const gate = () => { if (!requireAuth()) return false; if (!canInteract) { Alert.alert('먼저 커뮤니티에 가입해주세요'); return false } return true }

  const toggleLike = async () => {
    if (busy) return
    if (!gate()) return
    const next = !liked
    setLiked(next); setLikeCount((c) => c + (next ? 1 : -1)); setBusy(true)
    try {
      const r = await api.post(`/api/community-posts/${post.id}/like`) as { liked?: boolean; likeCount?: number }
      if (typeof r.liked === 'boolean') setLiked(r.liked)
      if (typeof r.likeCount === 'number') setLikeCount(r.likeCount)
    } catch {
      setLiked(!next); setLikeCount((c) => c + (next ? -1 : 1))
    } finally {
      setBusy(false)
    }
  }

  const vote = async (i: number) => {
    if (!poll || pollBusy) return
    if (!gate()) return
    setPollBusy(true)
    try {
      const r = await api.post(`/api/community-posts/${post.id}/poll/vote`, { optionIndex: i }) as { poll?: CommunityPoll }
      if (r.poll) setPoll(r.poll)
    } catch { /* 무시 */ } finally { setPollBusy(false) }
  }

  const pollEnded = poll ? new Date(poll.endsAt).getTime() <= Date.now() : false
  const showResults = poll ? (pollEnded || poll.myVote !== null) : false

  // 더보기 — 수정(작성자)·고정(매니저)·삭제(작성자/매니저)·신고(타인)
  const doDelete = () => Alert.alert('게시글을 삭제할까요?', undefined, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: async () => { try { await api.del(`/api/community-posts/${post.id}`) } catch { /* 무시 */ } onChanged?.() } },
  ])
  const doPin = async () => { try { await api.post(`/api/community-posts/${post.id}/pin`) } catch { /* 무시 */ } onChanged?.() }
  const doEdit = () => { setSelectedPost(post); router.push(`/compose?communityId=${post.communityId}&postId=${post.id}`) }
  const doReport = () => {
    const run = async (reason: string) => { try { await api.post(`/api/community-posts/${post.id}/report`, { reason }); Alert.alert('신고했어요') } catch { /* 무시 */ } }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...REPORT_REASONS, '취소'], cancelButtonIndex: REPORT_REASONS.length, title: '신고 사유' }, (i) => { if (i < REPORT_REASONS.length) run(REPORT_REASONS[i]) })
    } else {
      Alert.alert('신고 사유', undefined, [...REPORT_REASONS.map((r) => ({ text: r, onPress: () => run(r) })), { text: '취소', style: 'cancel' as const }])
    }
  }
  const openMenu = () => {
    const opts: string[] = []; const acts: Array<() => void> = []
    if (isAuthor) { opts.push('수정'); acts.push(doEdit) }
    if (isMgr) { opts.push(post.pinned ? '고정 해제' : '고정'); acts.push(doPin) }
    if (isAuthor || isMgr) { opts.push('삭제'); acts.push(doDelete) }
    if (!isAuthor) { opts.push('신고'); acts.push(doReport) }
    if (opts.length === 0) return
    const delIdx = opts.indexOf('삭제')
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...opts, '취소'], cancelButtonIndex: opts.length, destructiveButtonIndex: delIdx >= 0 ? delIdx : undefined },
        (i) => { if (i < acts.length) acts[i]() },
      )
    } else {
      Alert.alert('게시글', undefined, [...opts.map((o, i) => ({ text: o, style: (o === '삭제' ? 'destructive' : 'default') as 'destructive' | 'default', onPress: acts[i] })), { text: '취소', style: 'cancel' as const }])
    }
  }

  return (
    <Pressable onPress={() => { if (requireAuth()) onPress?.() }} style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}>
      {post.pinned ? (
        <View style={styles.pinRow}>
          <Icon name="pin" size={14} color={mono.color.text} />
          <Text style={styles.pinText}>매니저가 상단 고정함</Text>
        </View>
      ) : null}

      <View style={styles.head}>
        <Pressable onPress={post.authorUsername ? onAuthorPress : undefined} style={styles.avatar} hitSlop={4}>
          {post.authorAvatarUrl ? (
            <Image source={{ uri: post.authorAvatarUrl }} style={styles.fill} contentFit="cover" />
          ) : (
            <View style={[styles.fill, styles.avatarFallback, { backgroundColor: `hsl(${post.authorAvatarHue ?? 250}, 40%, 40%)` }]}><Text style={styles.avatarText}>{initial(post.authorName ?? post.authorUsername)}</Text></View>
          )}
        </Pressable>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.author} numberOfLines={1} onPress={post.authorUsername ? onAuthorPress : undefined} suppressHighlighting>
              {post.authorName ?? post.authorUsername ?? '익명'}
            </Text>
            {isManager ? <Text style={styles.mgr}>매니저</Text> : null}
          </View>
          <Text style={styles.time}>{relativeTime(post.createdAt)}</Text>
        </View>
        <Pressable onPress={openMenu} hitSlop={10} style={styles.more}><Icon name="ellipsis" size={18} color={mono.color.textTertiary} /></Pressable>
      </View>

      {post.content ? <Text style={styles.content}>{post.content}</Text> : null}

      {/* 이미지 — 한 장이면 원본 비율 그대로(크롭 X), 여러 장이면 정방형 그리드 */}
      {images.length === 1 ? (
        <View style={styles.gallery}><SingleImage uri={images[0]} /></View>
      ) : images.length > 1 ? (
        <View style={styles.gallery}>
          {images.slice(0, 4).map((uri, i) => (
            <View key={i} style={styles.galleryItem}>
              <Image source={{ uri }} style={styles.fill} contentFit="cover" transition={150} />
              {i === 3 && images.length > 4 ? (
                <View style={styles.moreOverlay}><Text style={styles.moreText}>+{images.length - 4}</Text></View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* 곡 임베드 — 커버 블러 배경(존재감) + 세로 커버 + 화이트 원형 재생 */}
      {post.song ? (
        <Pressable
          style={styles.song}
          onPress={() => {
            const s = post.song!
            if (!s.audioUrl) return
            if (songIsActive) { songPlaying ? TrackPlayer.pause() : TrackPlayer.play() }
            else playSong({ id: s.id, title: s.title, audioUrl: s.audioUrl, coverImage: s.coverImage ?? undefined, duration: s.duration ?? null })
          }}
        >
          {post.song.coverImage ? <Image source={{ uri: post.song.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} /> : null}
          <View style={styles.songScrim} pointerEvents="none" />
          <View style={styles.songRow}>
            <View style={styles.songCover}>
              {post.song.coverImage ? <Image source={{ uri: post.song.coverImage }} style={styles.fill} contentFit="cover" /> : <Text style={styles.songNote}>♪</Text>}
            </View>
            <View style={styles.flex}>
              <Text style={styles.songTitle} numberOfLines={2}>{post.song.title ?? '곡'}</Text>
              <Text style={styles.songSub}>모두의 노래</Text>
            </View>
            <View style={styles.songPlayBtn}>
              <Icon name={songPlaying ? 'pause.fill' : 'play.fill'} size={20} color={mono.color.bg} />
            </View>
          </View>
        </Pressable>
      ) : null}

      {/* 유튜브 / 링크 임베드 — 탭 시 인앱 브라우저(유튜브 재생) */}
      {ytThumb && embedUrl ? (
        <Pressable style={styles.embed} onPress={() => WebBrowser.openBrowserAsync(embedUrl)}>
          <Image source={{ uri: ytThumb }} style={styles.embedThumb} contentFit="cover" />
          <View style={styles.embedPlay}><View style={styles.ytBadge}><Icon name="play.fill" size={22} color={mono.color.onMedia} /></View></View>
        </Pressable>
      ) : og?.image && embedUrl ? (
        <Pressable style={styles.embed} onPress={() => WebBrowser.openBrowserAsync(embedUrl)}>
          <Image source={{ uri: og.image }} style={styles.embedThumb} contentFit="cover" />
          {og.title ? <Text style={styles.embedTitle} numberOfLines={2}>{og.title}</Text> : null}
        </Pressable>
      ) : null}

      {/* 투표 */}
      {poll ? (
        <View style={styles.poll}>
          {poll.options.map((opt, i) => {
            const count = poll.counts[i] ?? 0
            const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0
            const mine = poll.myVote === i
            return (
              <Pressable key={i} disabled={showResults || pollBusy} onPress={() => vote(i)} style={styles.pollOpt}>
                {showResults ? <View style={[styles.pollBar, { width: `${pct}%` }, mine && styles.pollBarMine]} /> : null}
                <View style={styles.pollOptRow}>
                  <Text style={[styles.pollOptText, mine && styles.pollOptMine]} numberOfLines={1}>{opt}</Text>
                  {showResults ? <Text style={styles.pollPct}>{pct}%</Text> : null}
                </View>
              </Pressable>
            )
          })}
          <Text style={styles.pollMeta}>{poll.totalVotes}명 참여{pollEnded ? ' · 종료됨' : ''}</Text>
        </View>
      ) : null}

      <View style={styles.meta}>
        <Pressable onPress={toggleLike} hitSlop={8} style={styles.metaBtn}>
          <Icon name={liked ? 'heart.fill' : 'heart'} size={16} color={liked ? mono.color.text : mono.color.textTertiary} />
          <Text style={[styles.metaText, liked && styles.liked]}>{likeCount}</Text>
        </Pressable>
        <View style={styles.metaBtn}>
          <Icon name="bubble.left" size={16} color={mono.color.textTertiary} />
          <Text style={styles.metaText}>{post.commentCount}</Text>
        </View>
      </View>
    </Pressable>
  )
}

// 단일 이미지 — 자연 비율을 측정해 컨테이너 비율에 반영(크롭 없이 원본 전체). 극단 비율은 완만히 클램프.
function SingleImage({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(1.5)
  return (
    <View style={[styles.gallerySingle, { aspectRatio: ratio }]}>
      <Image
        source={{ uri }}
        style={styles.fill}
        contentFit="contain"
        transition={150}
        onLoad={(e) => {
          const w = e.source?.width, h = e.source?.height
          if (w && h) setRatio(Math.min(2.2, Math.max(0.62, w / h)))
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  // 박스 없이 라인 구분(웹 파리티)
  row: { paddingVertical: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: mono.color.border },
  pressed: { opacity: 0.7 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mono.color.borderSoft },
  pinText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: mono.color.onMedia, fontSize: 15, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', flexShrink: 1 },
  mgr: {
    color: mono.color.accentLight, fontSize: 10, fontWeight: '700',
    backgroundColor: 'rgba(124,58,237,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  time: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 2 },
  more: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  content: { color: mono.color.text, fontSize: 16, lineHeight: 23 },
  // 이미지 갤러리
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gallerySingle: { width: '100%', aspectRatio: 1.5, borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  galleryItem: { width: '49%', aspectRatio: 1, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  moreOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: mono.color.onMedia, fontSize: mono.font.h2, fontWeight: '800' },
  // 곡 임베드 — 커버 블러 배경 + 세로(3:4) 썸네일 + 화이트 원형 재생(존재감)
  song: { borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  songScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,19,24,0.66)' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 16 },
  songCover: { width: 52, aspectRatio: 3 / 4, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  songNote: { color: mono.color.textTertiary, fontSize: 22 },
  songTitle: { color: mono.color.onMedia, fontSize: 16, fontWeight: '700', lineHeight: 21 },
  songSub: { color: 'rgba(255,255,255,0.6)', fontSize: mono.font.small, marginTop: 3, fontWeight: '600' },
  songPlayBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  // 유튜브/링크 임베드
  embed: { borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  embedThumb: { width: '100%', aspectRatio: 16 / 9 },
  embedPlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center',
  },
  ytBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  embedTitle: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600', padding: 10 },
  // 투표
  poll: { gap: 6 },
  pollOpt: {
    height: 40, borderRadius: mono.radius.md, backgroundColor: mono.color.fill, overflow: 'hidden', justifyContent: 'center',
  },
  pollBar: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: mono.color.fillStrong },
  pollBarMine: { backgroundColor: 'rgba(124,58,237,0.3)' },
  pollOptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  pollOptText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600', flexShrink: 1 },
  pollOptMine: { color: mono.color.accentLight },
  pollPct: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '700' },
  pollMeta: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 2 },
  // 좋아요·댓글
  meta: { flexDirection: 'row', gap: 18, alignItems: 'center', marginTop: 2 },
  metaBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  metaText: { color: mono.color.textTertiary, fontSize: mono.font.body, fontWeight: '600' },
  liked: { color: mono.color.text },
})
