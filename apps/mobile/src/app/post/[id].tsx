import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import type { CommunityPost, CommunityPostComment } from '@mono/shared'
import { api } from '@/lib/api'
import { getSelectedPost } from '@/lib/selected-post'
import { useSession } from '@/lib/use-session'
import { PostCard } from '@/components/ui/post-card'
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

// 댓글 1건 — 아바타·이름·시간·본문·좋아요·답글·삭제. isReply면 들여쓰기.
function CommentItem({ comment, myId, isReply, onReply, onDelete }: {
  comment: CommunityPostComment
  myId?: string
  isReply?: boolean
  onReply?: (c: CommunityPostComment) => void
  onDelete: (id: string) => void
}) {
  const [liked, setLiked] = useState(!!comment.liked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [busy, setBusy] = useState(false)
  const name = comment.user.displayName ?? comment.user.username ?? '익명'
  const toggleLike = async () => {
    if (busy) return
    const next = !liked
    setLiked(next); setLikeCount((c) => c + (next ? 1 : -1)); setBusy(true)
    try {
      const r = await api.post(`/api/community-comments/${comment.id}/like`) as { liked?: boolean; likeCount?: number }
      if (typeof r.liked === 'boolean') setLiked(r.liked)
      if (typeof r.likeCount === 'number') setLikeCount(r.likeCount)
    } catch {
      setLiked(!next); setLikeCount((c) => c + (next ? -1 : 1))
    } finally { setBusy(false) }
  }
  return (
    <View style={[styles.comment, isReply && styles.reply]}>
      <View style={isReply ? styles.rAvatar : styles.cAvatar}>
        {comment.user.avatarUrl ? (
          <Image source={{ uri: comment.user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <View style={[styles.avatarImg, styles.avFallback, { backgroundColor: `hsl(${comment.user.avatarHue ?? 250}, 40%, 40%)` }]}><Text style={styles.cAvatarText}>{initial(comment.user.displayName ?? comment.user.username)}</Text></View>
        )}
      </View>
      <View style={styles.flex}>
        <View style={styles.cAuthorRow}>
          <Text style={styles.cAuthor} numberOfLines={1}>{name}</Text>
          <Text style={styles.cTime}>{relativeTime(comment.createdAt)}</Text>
        </View>
        <Text style={styles.cBody}>{comment.body}</Text>
        <View style={styles.cActions}>
          <Pressable onPress={toggleLike} hitSlop={6} style={styles.cActBtn}>
            <Icon name={liked ? 'heart.fill' : 'heart'} size={13} color={liked ? mono.color.accentLight : mono.color.textTertiary} />
            {likeCount > 0 ? <Text style={[styles.cActText, liked && styles.cActTextOn]}>{likeCount}</Text> : null}
          </Pressable>
          {!isReply && onReply ? <Pressable onPress={() => onReply(comment)} hitSlop={6}><Text style={styles.cActText}>답글</Text></Pressable> : null}
          {comment.authorId === myId ? <Pressable onPress={() => onDelete(comment.id)} hitSlop={6}><Text style={styles.cDelete}>삭제</Text></Pressable> : null}
        </View>
      </View>
    </View>
  )
}

// 게시글 상세 — 본문(피드에서 전달된 post) + 댓글 목록 + 댓글 작성.
export default function PostDetailScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()
  const myId = session?.user?.id
  const [post] = useState<CommunityPost | null>(() => getSelectedPost())
  const [comments, setComments] = useState<CommunityPostComment[] | null>(null)
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const r = await api.get(`/api/community-posts/${id}/comments`) as { comments?: CommunityPostComment[] }
      setComments(r.comments ?? [])
    } catch {
      setComments([])
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const deleteComment = (commentId: string) => {
    Alert.alert('댓글을 삭제할까요?', undefined, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { try { await api.del(`/api/community-comments/${commentId}`) } catch {} ; load() } },
    ])
  }

  const send = async () => {
    const body = input.trim()
    if (!body || busy || !id) return
    setBusy(true)
    try {
      await api.post(`/api/community-posts/${id}/comments`, { body, parentId: replyTo?.id ?? null })
      setInput(''); setReplyTo(null)
      await load()
    } catch {
      // 유지 — 사용자가 재시도
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>‹</Text></Pressable>
          <Text style={styles.title}>게시글</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListHeaderComponent={
            <View>
              {post ? (
                <PostCard
                  post={post}
                  onChanged={() => router.back()}
                  onAuthorPress={post.authorUsername ? () => router.push(`/creator/${post.authorUsername}`) : undefined}
                />
              ) : null}
              <Text style={styles.commentsLabel}>댓글 {post?.commentCount ?? ''}</Text>
              {comments === null ? <ActivityIndicator color={mono.color.accent} style={{ marginTop: 20 }} /> : null}
            </View>
          }
          renderItem={({ item }) => (
            <View>
              <CommentItem comment={item} myId={myId} onDelete={deleteComment} onReply={(c) => setReplyTo({ id: c.id, name: c.user.displayName ?? c.user.username ?? '익명' })} />
              {item.replies?.map((r) => (
                <CommentItem key={r.id} comment={r} isReply myId={myId} onDelete={deleteComment} />
              ))}
            </View>
          )}
          ListEmptyComponent={comments && comments.length === 0 ? <Text style={styles.empty}>첫 댓글을 남겨보세요</Text> : null}
          showsVerticalScrollIndicator={false}
        />

        <View style={{ paddingBottom: insets.bottom + 8 }}>
          {replyTo ? (
            <View style={styles.replyBanner}>
              <Text style={styles.replyText} numberOfLines={1}>{replyTo.name}님에게 답글</Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}><Text style={styles.replyCancel}>취소</Text></Pressable>
            </View>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              style={styles.cInput}
              placeholder={replyTo ? '답글 달기…' : '댓글 달기…'}
              placeholderTextColor={mono.color.textTertiary}
              value={input}
              onChangeText={setInput}
              multiline
            />
            <Pressable onPress={send} disabled={!input.trim() || busy} hitSlop={8}>
              <Text style={[styles.send, (!input.trim() || busy) && styles.sendOff]}>{busy ? '···' : '등록'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  close: { color: mono.color.text, fontSize: 30, lineHeight: 30, width: 24 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  delete: { color: mono.color.danger, fontSize: mono.font.small, fontWeight: '700' },
  cDelete: { color: mono.color.textTertiary, fontSize: mono.font.tiny, fontWeight: '600' },
  post: { paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: mono.color.borderSoft },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.accentLight, fontSize: 16, fontWeight: '800' },
  author: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  postContent: { color: mono.color.text, fontSize: mono.font.body, lineHeight: 22 },
  media: { width: '100%', aspectRatio: 1.5, borderRadius: mono.radius.md, backgroundColor: mono.color.surface2 },
  postMeta: { color: mono.color.textTertiary, fontSize: mono.font.small },
  commentsLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.small, textAlign: 'center', marginTop: 20 },
  comment: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  reply: { paddingLeft: 42 },
  cAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  rAvatar: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  avFallback: { alignItems: 'center', justifyContent: 'center' },
  cAvatarText: { color: mono.color.onMedia, fontSize: 12, fontWeight: '800' },
  cAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cAuthor: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700', flexShrink: 1 },
  cTime: { color: mono.color.textTertiary, fontSize: mono.font.tiny },
  cBody: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 20, marginTop: 2 },
  cActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  cActBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cActText: { color: mono.color.textTertiary, fontSize: mono.font.tiny, fontWeight: '600' },
  cActTextOn: { color: mono.color.accentLight },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: mono.color.fill, borderRadius: mono.radius.md, marginBottom: 8,
  },
  replyText: { color: mono.color.textSecondary, fontSize: mono.font.small, flexShrink: 1 },
  replyCancel: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: mono.color.borderSoft,
  },
  cInput: {
    flex: 1, maxHeight: 100, color: mono.color.text, fontSize: mono.font.body,
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, paddingHorizontal: 14, paddingVertical: 10,
  },
  send: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '800', paddingBottom: 10 },
  sendOff: { color: mono.color.textTertiary },
})
