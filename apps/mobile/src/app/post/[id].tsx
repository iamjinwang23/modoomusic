import { useCallback, useEffect, useState } from 'react'
import {
  ActionSheetIOS, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import type { CommunityPost, CommunityPostComment } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getSelectedPost } from '@/lib/selected-post'
import { useSession } from '@/lib/use-session'
import { useAuthGate } from '@/lib/auth-gate'
import { PostCard } from '@/components/ui/post-card'
import { Icon } from '@/components/ui/icon'
import { CommentMoreSheet } from '@/components/ui/comment-more-sheet'
import { mono } from '@/theme/mono'

function initial(name: string | null): string {
  return (name?.trim().charAt(0) || '?').toUpperCase()
}

// 서버 허용 목록과 일치(community_comment_reports CHECK)
const REPORT_REASONS = ['욕설·비속어', '음란물', '혐오·차별 표현', '도배', '광고·홍보성 콘텐츠', '개인정보 노출', '저작권 침해', '기타']

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}일 전` : `${Math.floor(d / 7)}주 전`
}

// 댓글 1건 — 아바타·이름·시간·본문·좋아요·답글 + ⋯ 더보기(수정/삭제, 매니저 삭제). 인라인 수정.
function CommentItem({ comment, myId, isReply, canInteract, isManager, onReply, onDelete, onEdited, onOpenMenu }: {
  comment: CommunityPostComment
  myId?: string
  isReply?: boolean
  canInteract?: boolean
  isManager?: boolean
  onReply?: (c: CommunityPostComment) => void
  onDelete: (id: string) => void
  onEdited: (id: string, body: string) => void
  onOpenMenu: (h: { isOwner: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void }) => void
}) {
  const { requireAuth } = useAuthGate()
  const [liked, setLiked] = useState(!!comment.liked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.body)
  const [editBusy, setEditBusy] = useState(false)
  const isOwner = comment.authorId === myId
  const name = comment.user.displayName ?? comment.user.username ?? '익명'
  const toggleLike = async () => {
    if (busy || !requireAuth()) return
    if (!canInteract) { Alert.alert('먼저 커뮤니티에 가입해주세요'); return }
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
  const saveEdit = async () => {
    const t = editText.trim()
    if (!t || editBusy) return
    setEditBusy(true)
    try { await api.patch(`/api/community-comments/${comment.id}`, { body: t }); onEdited(comment.id, t); setEditing(false) } catch {} finally { setEditBusy(false) }
  }
  const report = () => {
    const run = async (reason: string) => { try { await api.post(`/api/community-comments/${comment.id}/report`, { reason }); Alert.alert('신고했어요') } catch {} }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...REPORT_REASONS, '취소'], cancelButtonIndex: REPORT_REASONS.length, title: '신고 사유' }, (i) => { if (i < REPORT_REASONS.length) run(REPORT_REASONS[i]) })
    } else {
      Alert.alert('신고 사유', undefined, [...REPORT_REASONS.map((r) => ({ text: r, onPress: () => run(r) })), { text: '취소', style: 'cancel' as const }])
    }
  }
  // ⋯ 메뉴 — 항상 노출(본인·매니저=수정/삭제 / 타인=신고)
  const openMenu = () => onOpenMenu({ isOwner, canDelete: isOwner || !!isManager, onEdit: () => { setEditText(comment.body); setEditing(true) }, onDelete: () => onDelete(comment.id), onReport: report })
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
          <Text style={styles.cTime}>{relativeTime(comment.createdAt)}{comment.editedAt ? ' (수정됨)' : ''}</Text>
          <Pressable onPress={openMenu} hitSlop={8} style={styles.cMore}><Icon name="ellipsis" size={16} color={mono.color.textTertiary} /></Pressable>
        </View>
        {editing ? (
          <View style={styles.editWrap}>
            <TextInput style={styles.editInput} value={editText} onChangeText={setEditText} multiline autoFocus maxLength={500} />
            <View style={styles.editBtns}>
              <Pressable onPress={() => setEditing(false)} hitSlop={6}><Text style={styles.editCancel}>취소</Text></Pressable>
              <Pressable onPress={saveEdit} disabled={!editText.trim() || editBusy} hitSlop={6}><Text style={[styles.editSave, (!editText.trim() || editBusy) && styles.dim]}>{editBusy ? '저장 중…' : '저장'}</Text></Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.cBody}>{comment.body}</Text>
        )}
        <View style={styles.cActions}>
          <Pressable onPress={toggleLike} hitSlop={6} style={styles.cActBtn}>
            <Icon name={liked ? 'heart.fill' : 'heart'} size={16} color={liked ? mono.color.text : mono.color.textTertiary} />
            {likeCount > 0 ? <Text style={[styles.cActText, liked && styles.cActTextOn]}>{likeCount}</Text> : null}
          </Pressable>
          {!isReply && onReply ? <Pressable onPress={() => onReply(comment)} hitSlop={6}><Text style={styles.cActText}>답글</Text></Pressable> : null}
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
  const { requireAuth } = useAuthGate()
  const myId = session?.user?.id
  const [post] = useState<CommunityPost | null>(() => getSelectedPost())
  const [comments, setComments] = useState<CommunityPostComment[] | null>(null)
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [canInteract, setCanInteract] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<{ isOwner: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void; onReport: () => void } | null>(null)
  const [myAvatar, setMyAvatar] = useState<{ url: string | null; hue: number; name: string | null } | null>(null)

  // 커뮤니티 멤버십 조회 → 비회원은 댓글·좋아요 게이팅
  useEffect(() => {
    const cid = post?.communityId
    if (!cid) return
    api.get(`/api/communities/${cid}`)
      .then((j) => { const c = (j as { community?: { isMember?: boolean; isManager?: boolean } }).community; setCanInteract(!!(c?.isMember || c?.isManager)); setIsManager(!!c?.isManager) })
      .catch(() => {})
  }, [post?.communityId])

  // 입력창 좌측 내 아바타
  useEffect(() => {
    if (!myId) return
    supabase.from('profiles').select('avatar_url, avatar_hue, display_name, username').eq('id', myId).maybeSingle()
      .then(({ data }) => { const p = data as { avatar_url?: string | null; avatar_hue?: number | null; display_name?: string | null; username?: string | null } | null; setMyAvatar({ url: p?.avatar_url ?? null, hue: p?.avatar_hue ?? 250, name: p?.display_name ?? p?.username ?? null }) })
  }, [myId])

  const patchLocal = (cid: string, body: string) => setComments((cs) => cs ? cs.map((c) => c.id === cid ? { ...c, body, editedAt: new Date().toISOString(), replies: c.replies?.map((r) => r.id === cid ? { ...r, body, editedAt: new Date().toISOString() } : r) } : { ...c, replies: c.replies?.map((r) => r.id === cid ? { ...r, body, editedAt: new Date().toISOString() } : r) }) : cs)

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
    if (!requireAuth()) return
    const body = input.trim()
    if (!body || busy || !id) return
    if (!canInteract) { Alert.alert('먼저 커뮤니티에 가입해주세요'); return }
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
                  canInteract={canInteract}
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
              <CommentItem comment={item} myId={myId} canInteract={canInteract} isManager={isManager} onDelete={deleteComment} onEdited={patchLocal} onOpenMenu={setMenu} onReply={(c) => setReplyTo({ id: c.id, name: c.user.displayName ?? c.user.username ?? '익명' })} />
              {item.replies?.map((r) => (
                <CommentItem key={r.id} comment={r} isReply myId={myId} canInteract={canInteract} isManager={isManager} onDelete={deleteComment} onEdited={patchLocal} onOpenMenu={setMenu} />
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
          {/* 곡 댓글과 동일 스타일 — 좌측 아바타 + 필 입력 + 원형 ↑ */}
          <View style={styles.composerRow}>
            <View style={styles.cAvatar}>
              {myAvatar?.url ? (
                <Image source={{ uri: myAvatar.url }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <View style={[styles.avatarImg, styles.avFallback, { backgroundColor: `hsl(${myAvatar?.hue ?? 250}, 40%, 40%)` }]}><Text style={styles.cAvatarText}>{initial(myAvatar?.name ?? null)}</Text></View>
              )}
            </View>
            <View style={styles.composer}>
              <TextInput
                style={styles.cInput}
                placeholder={replyTo ? '답글 달기…' : '댓글을 남겨주세요'}
                placeholderTextColor={mono.color.textTertiary}
                value={input}
                onChangeText={setInput}
                maxLength={500}
                multiline
                editable={!!myId}
              />
              {/* 게스트: 입력창 탭 → 로그인 */}
              {!myId ? <Pressable style={StyleSheet.absoluteFill} onPress={requireAuth} /> : null}
              {myId && input.trim() ? (
                <Animated.View entering={ZoomIn.duration(150)} exiting={ZoomOut.duration(150)} style={styles.sendWrap}>
                  <Pressable onPress={send} disabled={busy} style={styles.sendBtn} hitSlop={6}>
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendArrow}>↑</Text>}
                  </Pressable>
                </Animated.View>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      <CommentMoreSheet
        open={!!menu}
        onClose={() => setMenu(null)}
        isOwner={!!menu?.isOwner}
        canDelete={!!menu?.canDelete}
        canReport={!menu?.isOwner}
        onEdit={() => menu?.onEdit()}
        onDelete={() => menu?.onDelete()}
        onReport={() => menu?.onReport()}
      />
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
  // 곡 댓글과 동일 스펙(아바타·폰트 상향)
  cAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  rAvatar: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  avFallback: { alignItems: 'center', justifyContent: 'center' },
  cAvatarText: { color: mono.color.onMedia, fontSize: 13, fontWeight: '800' },
  cAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cAuthor: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', flexShrink: 1 },
  cTime: { color: mono.color.textTertiary, fontSize: mono.font.small, flexShrink: 1 },
  cMore: { marginLeft: 'auto', padding: 2 },
  cBody: { color: mono.color.textSecondary, fontSize: 16, lineHeight: 23, marginTop: 3 },
  cActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  cActBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cActText: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  cActTextOn: { color: mono.color.text },
  // 인라인 수정
  editWrap: { marginTop: 4 },
  editInput: { color: mono.color.text, fontSize: 16, lineHeight: 22, backgroundColor: mono.color.surface2, borderRadius: mono.radius.md, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44 },
  editBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 6 },
  editCancel: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  editSave: { color: mono.color.accentLight, fontSize: mono.font.small, fontWeight: '700' },
  dim: { opacity: 0.5 },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: mono.color.fill, borderRadius: mono.radius.md, marginBottom: 8,
  },
  replyText: { color: mono.color.textSecondary, fontSize: mono.font.small, flexShrink: 1 },
  replyCancel: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  // 곡 댓글과 동일 — 아바타 + 필 입력 + 원형 ↑
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: mono.color.borderSoft },
  composer: { position: 'relative', flex: 1 },
  cInput: {
    maxHeight: 120, color: mono.color.text, fontSize: mono.font.body, lineHeight: 20,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: mono.radius.pill, paddingLeft: 18, paddingRight: 48, paddingTop: 11, paddingBottom: 11,
  },
  sendWrap: { position: 'absolute', right: 4, bottom: 4 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: mono.color.accent, alignItems: 'center', justifyContent: 'center' },
  sendArrow: { color: '#fff', fontSize: 17, fontWeight: '800', lineHeight: 20 },
})
