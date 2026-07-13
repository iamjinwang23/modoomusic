import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated'
import { Image } from 'expo-image'
import type { Comment } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/use-session'
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

// 곡 댓글 1건 — 아바타·이름·시간·본문·좋아요·답글·삭제. 커뮤니티 post/[id] 패턴, API만 곡용.
function CommentItem({ comment, myId, isReply, onReply, onDelete, requireLogin }: {
  comment: Comment
  myId?: string
  isReply?: boolean
  onReply?: (c: Comment) => void
  onDelete: (id: string) => void
  requireLogin: () => boolean
}) {
  const [liked, setLiked] = useState(!!comment.liked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [busy, setBusy] = useState(false)
  const name = comment.user.displayName ?? comment.user.username ?? '익명'
  const toggleLike = async () => {
    if (busy || !requireLogin()) return
    const next = !liked
    setLiked(next); setLikeCount((c) => c + (next ? 1 : -1)); setBusy(true)
    try {
      const r = await api.post(`/api/comments/${comment.id}/like`) as { liked?: boolean; likeCount?: number }
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
            <Icon name={liked ? 'heart.fill' : 'heart'} size={16} color={liked ? mono.color.accentLight : mono.color.textTertiary} />
            {likeCount > 0 ? <Text style={[styles.cActText, liked && styles.cActTextOn]}>{likeCount}</Text> : null}
          </Pressable>
          {!isReply && onReply ? <Pressable onPress={() => onReply(comment)} hitSlop={6}><Text style={styles.cActText}>답글</Text></Pressable> : null}
          {comment.userId === myId ? <Pressable onPress={() => onDelete(comment.id)} hitSlop={6}><Text style={styles.cDelete}>삭제</Text></Pressable> : null}
        </View>
      </View>
    </View>
  )
}

// 곡 댓글 섹션 — 플레이어 가사/댓글 토글의 댓글 탭. 목록(top+답글) + 작성.
// GET/POST /api/songs/[id]/comments · POST /api/comments/[id]/reply · like · DELETE.
// 곡 댓글 상태 훅 — 목록(스크롤 내부)과 입력창(하단 고정)이 분리 렌더돼서 상태를 공유.
// active=false 동안엔 로드하지 않음(가사 탭일 때 불필요한 요청 방지).
export function useSongComments(songId: string | null, active: boolean) {
  const { session } = useSession()
  const myId = session?.user?.id
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // 입력창 좌측 내 아바타
  const [me, setMe] = useState<{ avatarUrl: string | null; avatarHue: number | null; name: string | null } | null>(null)

  useEffect(() => {
    if (!myId) { setMe(null); return }
    supabase.from('profiles').select('avatar_url, avatar_hue, display_name, username').eq('id', myId).maybeSingle()
      .then(({ data }) => {
        const p = data as { avatar_url?: string | null; avatar_hue?: number | null; display_name?: string | null; username?: string | null } | null
        setMe({ avatarUrl: p?.avatar_url ?? null, avatarHue: p?.avatar_hue ?? null, name: p?.display_name ?? p?.username ?? null })
      })
  }, [myId])

  const requireLogin = useCallback(() => {
    if (myId) return true
    Alert.alert('로그인이 필요해요')
    return false
  }, [myId])

  const load = useCallback(async () => {
    if (!songId) return
    try {
      const r = await api.get(`/api/songs/${songId}/comments`) as { comments?: Comment[] }
      setComments(r.comments ?? [])
    } catch {
      setComments([])
    }
  }, [songId])

  // 곡이 바뀌면 초기화, 댓글 탭이 열려 있고 아직 안 불렀으면 로드
  useEffect(() => { setComments(null); setReplyTo(null) }, [songId])
  useEffect(() => { if (active && comments === null) load() }, [active, comments, load])

  const deleteComment = (commentId: string) => {
    Alert.alert('댓글을 삭제할까요?', undefined, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { try { await api.del(`/api/comments/${commentId}`) } catch {} ; load() } },
    ])
  }

  const send = async () => {
    const body = input.trim()
    if (!body || busy || !requireLogin()) return
    setBusy(true)
    try {
      if (replyTo) await api.post(`/api/comments/${replyTo.id}/reply`, { body })
      else if (songId) await api.post(`/api/songs/${songId}/comments`, { body })
      setInput(''); setReplyTo(null)
      await load()
    } catch {
      // 입력 유지 — 사용자가 재시도
    } finally {
      setBusy(false)
    }
  }

  return { myId, me, comments, input, setInput, replyTo, setReplyTo, busy, send, deleteComment, requireLogin }
}

export type SongCommentsState = ReturnType<typeof useSongComments>

// 댓글 목록 — 플레이어 스크롤 콘텐츠 안에 렌더
export function SongCommentList({ state }: { state: SongCommentsState }) {
  const { comments, myId, requireLogin, deleteComment, setReplyTo } = state
  // 서버는 top+답글을 평평하게 반환(created asc) — parentId로 그룹화
  const tops = (comments ?? []).filter((c) => !c.parentId)
  const repliesOf = (id: string) => (comments ?? []).filter((c) => c.parentId === id)

  return (
    <View>
      {comments === null ? <ActivityIndicator color={mono.color.accent} style={{ marginTop: 20 }} /> : null}
      {comments && tops.length === 0 ? <Text style={styles.empty}>첫 댓글을 남겨보세요</Text> : null}
      {tops.map((c) => (
        <View key={c.id}>
          <CommentItem comment={c} myId={myId} requireLogin={requireLogin} onDelete={deleteComment} onReply={(t) => setReplyTo({ id: t.id, name: t.user.displayName ?? t.user.username ?? '익명' })} />
          {repliesOf(c.id).map((r) => (
            <CommentItem key={r.id} comment={r} isReply myId={myId} requireLogin={requireLogin} onDelete={deleteComment} />
          ))}
        </View>
      ))}
    </View>
  )
}

// 댓글 입력창 — 플레이어 하단 고정 바에 렌더 (웹 파리티: rounded 20 글래스 + 원형 ↑ 페이드인)
export function SongCommentComposer({ state }: { state: SongCommentsState }) {
  const { me, input, setInput, replyTo, setReplyTo, busy, send } = state
  return (
    <View>
      {replyTo ? (
        <View style={styles.replyBanner}>
          <Text style={styles.replyText} numberOfLines={1}>{replyTo.name}님에게 답글</Text>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}><Text style={styles.replyCancel}>취소</Text></Pressable>
        </View>
      ) : null}
      <View style={styles.composerRow}>
        {/* 내 아바타 — 댓글 아바타와 동일 룩 */}
        <View style={styles.cAvatar}>
          {me?.avatarUrl ? (
            <Image source={{ uri: me.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <View style={[styles.avatarImg, styles.avFallback, { backgroundColor: `hsl(${me?.avatarHue ?? 250}, 40%, 40%)` }]}><Text style={styles.cAvatarText}>{initial(me?.name ?? null)}</Text></View>
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
          />
          {input.trim() ? (
            <Animated.View entering={ZoomIn.duration(150)} exiting={ZoomOut.duration(150)} style={styles.sendWrap}>
              <Pressable onPress={send} disabled={busy} style={styles.sendBtn} hitSlop={6}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendArrow}>↑</Text>}
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.small, textAlign: 'center', marginTop: 20 },
  comment: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  reply: { paddingLeft: 48 },
  cAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  rAvatar: { width: 30, height: 30, borderRadius: 15, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  avFallback: { alignItems: 'center', justifyContent: 'center' },
  cAvatarText: { color: mono.color.onMedia, fontSize: 13, fontWeight: '800' },
  cAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cAuthor: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', flexShrink: 1 },
  cTime: { color: mono.color.textTertiary, fontSize: mono.font.small },
  cBody: { color: mono.color.textSecondary, fontSize: 16, lineHeight: 23, marginTop: 3 },
  cActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  cActBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cActText: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  cActTextOn: { color: mono.color.accentLight },
  cDelete: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: mono.color.fill, borderRadius: mono.radius.md, marginTop: 4, marginBottom: 8,
  },
  replyText: { color: mono.color.textSecondary, fontSize: mono.font.small, flexShrink: 1 },
  replyCancel: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600' },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  composer: { position: 'relative', flex: 1 },
  // 웹 룩 + 필(최대 라운드) — bg-white/6 · border-white/8 · pr(버튼 자리)
  cInput: {
    maxHeight: 120, color: mono.color.text, fontSize: mono.font.body, lineHeight: 20,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: mono.radius.pill, paddingLeft: 18, paddingRight: 48, paddingTop: 11, paddingBottom: 11,
  },
  // 웹: 원형 바이올렛 ↑ — absolute bottom-right, 입력 시 스케일 페이드인
  sendWrap: { position: 'absolute', right: 4, bottom: 4 },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: mono.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendArrow: { color: '#fff', fontSize: 17, fontWeight: '800', lineHeight: 20 },
})
