import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { CommunityPost, CommunityPoll } from '@mono/shared'
import { api } from '@/lib/api'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

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
export function PostCard({ post, managerId, onPress, onAuthorPress }: {
  post: CommunityPost
  managerId?: string | null
  onPress?: () => void
  onAuthorPress?: () => void
}) {
  const [liked, setLiked] = useState(!!post.liked)
  const [likeCount, setLikeCount] = useState(post.likeCount)
  const [busy, setBusy] = useState(false)
  const [poll, setPoll] = useState<CommunityPoll | null>(post.poll ?? null)
  const [pollBusy, setPollBusy] = useState(false)
  const [og, setOg] = useState<{ image?: string; title?: string } | null>(null)

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

  const toggleLike = async () => {
    if (busy) return
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
    setPollBusy(true)
    try {
      const r = await api.post(`/api/community-posts/${post.id}/poll/vote`, { optionIndex: i }) as { poll?: CommunityPoll }
      if (r.poll) setPoll(r.poll)
    } catch { /* 무시 */ } finally { setPollBusy(false) }
  }

  const pollEnded = poll ? new Date(poll.endsAt).getTime() <= Date.now() : false
  const showResults = poll ? (pollEnded || poll.myVote !== null) : false

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}>
      {post.pinned ? <Text style={styles.pin}>📌 고정됨</Text> : null}

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
      </View>

      {post.content ? <Text style={styles.content}>{post.content}</Text> : null}

      {/* 다중 이미지 갤러리 */}
      {images.length > 0 ? (
        <View style={styles.gallery}>
          {images.slice(0, 4).map((uri, i) => (
            <View key={i} style={images.length === 1 ? styles.gallerySingle : styles.galleryItem}>
              <Image source={{ uri }} style={styles.fill} contentFit="cover" transition={150} />
              {i === 3 && images.length > 4 ? (
                <View style={styles.moreOverlay}><Text style={styles.moreText}>+{images.length - 4}</Text></View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* 곡 임베드 */}
      {post.song ? (
        <View style={styles.song}>
          <View style={styles.songCover}>
            {post.song.coverImage ? <Image source={{ uri: post.song.coverImage }} style={styles.fill} contentFit="cover" /> : <Text style={styles.songNote}>♪</Text>}
          </View>
          <View style={styles.flex}>
            <Text style={styles.songTitle} numberOfLines={1}>{post.song.title ?? '곡'}</Text>
            <Text style={styles.songSub}>모두의 노래</Text>
          </View>
          <Icon name="play.fill" size={18} color={mono.color.textSecondary} />
        </View>
      ) : null}

      {/* 유튜브 / 링크 임베드 */}
      {ytThumb ? (
        <View style={styles.embed}>
          <Image source={{ uri: ytThumb }} style={styles.embedThumb} contentFit="cover" />
          <View style={styles.embedPlay}><Icon name="play.fill" size={20} color={mono.color.onMedia} /></View>
        </View>
      ) : og?.image ? (
        <View style={styles.embed}>
          <Image source={{ uri: og.image }} style={styles.embedThumb} contentFit="cover" />
          {og.title ? <Text style={styles.embedTitle} numberOfLines={2}>{og.title}</Text> : null}
        </View>
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
          <Icon name={liked ? 'heart.fill' : 'heart'} size={16} color={liked ? mono.color.danger : mono.color.textTertiary} />
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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  // 박스 없이 라인 구분(웹 파리티)
  row: { paddingVertical: 16, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mono.color.borderSoft },
  pressed: { opacity: 0.7 },
  pin: { color: mono.color.accentLight, fontSize: mono.font.tiny, fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: mono.color.onMedia, fontSize: 15, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700', flexShrink: 1 },
  mgr: {
    color: mono.color.accentLight, fontSize: 10, fontWeight: '700',
    backgroundColor: 'rgba(124,58,237,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  time: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 2 },
  content: { color: mono.color.text, fontSize: mono.font.body, lineHeight: 21 },
  // 이미지 갤러리
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gallerySingle: { width: '100%', aspectRatio: 1.5, borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  galleryItem: { width: '49%', aspectRatio: 1, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  moreOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: mono.color.onMedia, fontSize: mono.font.h2, fontWeight: '800' },
  // 곡 임베드
  song: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: mono.color.fill, borderRadius: mono.radius.md, padding: 10,
  },
  songCover: { width: 40, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  songNote: { color: mono.color.textTertiary, fontSize: 18 },
  songTitle: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  songSub: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 2 },
  // 유튜브/링크 임베드
  embed: { borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  embedThumb: { width: '100%', aspectRatio: 16 / 9 },
  embedPlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center',
  },
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
  metaText: { color: mono.color.textTertiary, fontSize: mono.font.small },
  liked: { color: mono.color.danger },
})
