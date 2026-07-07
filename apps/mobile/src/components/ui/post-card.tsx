import { StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { CommunityPost } from '@mono/shared'
import { mono } from '@/theme/mono'

function initial(name: string | null): string {
  return (name?.trim().charAt(0) || '?').toUpperCase()
}

// 게시글 카드 — 작성자/본문/첨부이미지/곡/좋아요·댓글 수. 커뮤니티 피드 파리티(읽기).
export function PostCard({ post }: { post: CommunityPost }) {
  const img = post.imageUrls?.[0] ?? post.imageUrl
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          {post.authorAvatarUrl ? (
            <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarText}>{initial(post.authorName ?? post.authorUsername)}</Text>
          )}
        </View>
        <View style={styles.flex}>
          <Text style={styles.author} numberOfLines={1}>{post.authorName ?? post.authorUsername ?? '익명'}</Text>
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
        <Text style={styles.metaText}>♥ {post.likeCount}</Text>
        <Text style={styles.metaText}>💬 {post.commentCount}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, padding: 14,
    borderWidth: 1, borderColor: mono.color.borderSoft, marginBottom: 10, gap: 10,
  },
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
  meta: { flexDirection: 'row', gap: 16 },
  metaText: { color: mono.color.textTertiary, fontSize: mono.font.small },
})
