import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { CommunityPost } from '@mono/shared'
import { api } from '@/lib/api'
import { mono } from '@/theme/mono'

function initial(name: string | null): string {
  return (name?.trim().charAt(0) || '?').toUpperCase()
}

// 게시글 카드 — 작성자/본문/첨부이미지/곡/좋아요·댓글. 좋아요 토글, 탭→상세, 작성자→프로필.
export function PostCard({ post, onPress, onAuthorPress }: { post: CommunityPost; onPress?: () => void; onAuthorPress?: () => void }) {
  const img = post.imageUrls?.[0] ?? post.imageUrl
  const [liked, setLiked] = useState(!!post.liked)
  const [likeCount, setLikeCount] = useState(post.likeCount)
  const [busy, setBusy] = useState(false)

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

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && onPress && styles.pressed]}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          {post.authorAvatarUrl ? (
            <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarText}>{initial(post.authorName ?? post.authorUsername)}</Text>
          )}
        </View>
        <View style={styles.flex}>
          <Text style={styles.author} numberOfLines={1} onPress={post.authorUsername ? onAuthorPress : undefined} suppressHighlighting>
            {post.authorName ?? post.authorUsername ?? '익명'}
          </Text>
        </View>
        {post.pinned ? <Text style={styles.pin}>고정</Text> : null}
      </View>

      {post.content ? <Text style={styles.content}>{post.content}</Text> : null}

      {img ? <Image source={{ uri: img }} style={styles.media} contentFit="cover" /> : null}

      {post.song ? (
        <View style={styles.song}>
          <View style={styles.songCover}>
            {post.song.coverImage ? (
              <Image source={{ uri: post.song.coverImage }} style={styles.avatarImg} contentFit="cover" />
            ) : null}
          </View>
          <Text style={styles.songTitle} numberOfLines={1}>♪ {post.song.title ?? '곡'}</Text>
        </View>
      ) : null}

      <View style={styles.meta}>
        <Pressable onPress={toggleLike} hitSlop={8} style={styles.metaBtn}>
          <Text style={[styles.metaText, liked && styles.liked]}>{liked ? '♥' : '♡'} {likeCount}</Text>
        </Pressable>
        <Text style={styles.metaText}>💬 {post.commentCount}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, padding: 14,
    borderWidth: 1, borderColor: mono.color.borderSoft, marginBottom: 10, gap: 10,
  },
  pressed: { opacity: 0.9 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
    backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.accentLight, fontSize: 15, fontWeight: '800' },
  author: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  pin: { color: mono.color.accentLight, fontSize: mono.font.tiny, fontWeight: '700' },
  content: { color: mono.color.text, fontSize: mono.font.body, lineHeight: 21 },
  media: { width: '100%', aspectRatio: 1.5, borderRadius: mono.radius.md, backgroundColor: mono.color.surface2 },
  song: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: mono.color.fill, borderRadius: mono.radius.md, padding: 8,
  },
  songCover: { width: 32, height: 32, borderRadius: 6, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  songTitle: { flex: 1, color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  meta: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  metaBtn: { paddingVertical: 2 },
  metaText: { color: mono.color.textTertiary, fontSize: mono.font.small },
  liked: { color: mono.color.danger },
})
