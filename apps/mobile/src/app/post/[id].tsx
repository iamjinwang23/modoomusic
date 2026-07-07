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
import { mono } from '@/theme/mono'

function initial(name: string | null): string {
  return (name?.trim().charAt(0) || '?').toUpperCase()
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

  const deletePost = () => {
    if (!id) return
    Alert.alert('게시글을 삭제할까요?', undefined, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { try { await api.del(`/api/community-posts/${id}`) } catch {} ; router.back() } },
    ])
  }

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
      await api.post(`/api/community-posts/${id}/comments`, { body })
      setInput('')
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
          {post && post.authorId === myId ? (
            <Pressable onPress={deletePost} hitSlop={12}><Text style={styles.delete}>삭제</Text></Pressable>
          ) : <View style={{ width: 24 }} />}
        </View>

        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListHeaderComponent={
            <View>
              {post ? (
                <View style={styles.post}>
                  <View style={styles.postHead}>
                    <View style={styles.avatar}>
                      {post.authorAvatarUrl ? (
                        <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.avatarText}>{initial(post.authorName ?? post.authorUsername)}</Text>
                      )}
                    </View>
                    <Text style={styles.author}>{post.authorName ?? post.authorUsername ?? '익명'}</Text>
                  </View>
                  {post.content ? <Text style={styles.postContent}>{post.content}</Text> : null}
                  {post.imageUrls?.[0] ? <Image source={{ uri: post.imageUrls[0] }} style={styles.media} contentFit="cover" /> : null}
                  <Text style={styles.postMeta}>♥ {post.likeCount}  ·  댓글 {post.commentCount}</Text>
                </View>
              ) : null}
              <Text style={styles.commentsLabel}>댓글</Text>
              {comments === null ? <ActivityIndicator color={mono.color.accent} style={{ marginTop: 20 }} /> : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.comment}>
              <View style={styles.cAvatar}>
                {item.user.avatarUrl ? (
                  <Image source={{ uri: item.user.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.cAvatarText}>{initial(item.user.displayName ?? item.user.username)}</Text>
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.cAuthor}>{item.user.displayName ?? item.user.username ?? '익명'}</Text>
                <Text style={styles.cBody}>{item.body}</Text>
              </View>
              {item.authorId === myId ? (
                <Pressable onPress={() => deleteComment(item.id)} hitSlop={8}><Text style={styles.cDelete}>삭제</Text></Pressable>
              ) : null}
            </View>
          )}
          ListEmptyComponent={comments && comments.length === 0 ? <Text style={styles.empty}>첫 댓글을 남겨보세요</Text> : null}
          showsVerticalScrollIndicator={false}
        />

        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.cInput}
            placeholder="댓글 달기…"
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
  cAvatar: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  cAvatarText: { color: mono.color.accentLight, fontSize: 13, fontWeight: '800' },
  cAuthor: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  cBody: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 20, marginTop: 2 },
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
