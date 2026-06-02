'use client'
// Design Ref: comments §5.2 — 댓글 패널: fetch + 새 댓글 작성 + 카운트 + 리스트 + 신고 모달
import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { commentService } from '@/services/comment.service'
import { toast } from '@/components/toast/toast'
import { useAuth } from '@/components/AuthProvider'
import { profileColor } from '@/utils/profileColor'
import { CommentItem } from './CommentItem'
import { CommentReportModal } from './CommentReportModal'
import { EmojiHotkeyBar } from './EmojiHotkeyBar'
import type { Comment } from '@/types/domain'

interface Props {
  songId: string
  songOwnerId: string | null
  songIsPublic: boolean
}

export function CommentsPanel({ songId, songOwnerId, songIsPublic }: Props) {
  const { user, profile } = useAuth()
  const currentUserId = user?.id ?? null

  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reporting, setReporting] = useState<Comment | null>(null)

  const newInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!songIsPublic) { setLoading(false); setComments([]); return }
    let cancelled = false
    setLoading(true)
    commentService.listForSong(songId)
      .then((list) => { if (!cancelled) setComments(list) })
      .catch((e) => {
        if (cancelled) return
        console.error('[CommentsPanel fetch]', e)
        toast.error('댓글을 불러오지 못했어요')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [songId, songIsPublic])

  const onLoginRequired = useCallback(() => {
    window.dispatchEvent(new Event('open-login'))
  }, [])

  function insertEmoji(e: string) {
    const input = newInputRef.current
    if (!input) { setBody((b) => b + e); return }
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const next = body.slice(0, start) + e + body.slice(end)
    setBody(next)
    // 다음 렌더 후 커서 위치 보정
    requestAnimationFrame(() => {
      const pos = start + e.length
      input.focus()
      input.setSelectionRange(pos, pos)
    })
  }

  async function handleSubmit() {
    const text = body.trim()
    if (!text || submitting) return
    if (!currentUserId) { onLoginRequired(); return }
    if (!songIsPublic) { toast.error('비공개 곡엔 댓글을 남길 수 없어요'); return }
    setSubmitting(true)
    try {
      const next = await commentService.create(songId, text)
      setComments((prev) => [next, ...prev])
      setBody('')
      window.dispatchEvent(new CustomEvent('song-comment-count-changed', { detail: { songId, delta: 1 } }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '댓글 작성에 실패했어요')
    } finally { setSubmitting(false) }
  }

  function handleReplyCreated(reply: Comment) {
    setComments((prev) => [...prev, reply])
  }
  function handleEdited(next: Comment) {
    setComments((prev) => prev.map((c) => c.id === next.id ? next : c))
  }
  function handleDeleted(id: string) {
    const deleted = comments.find((c) => c.id === id)
    setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id))
    // top-level 삭제만 카운트 감소 (대댓글은 부모 cascade로 함께 사라지므로 별도 카운트 없음)
    if (deleted && deleted.parentId === null) {
      window.dispatchEvent(new CustomEvent('song-comment-count-changed', { detail: { songId, delta: -1 } }))
    }
  }

  // 분리: top(최신순) + 부모별 대댓글(오래된순)
  const topComments = comments
    .filter((c) => c.parentId === null)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const repliesByParent = new Map<string, Comment[]>()
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? []
      arr.push(c)
      repliesByParent.set(c.parentId, arr)
    }
  }
  for (const [k, v] of repliesByParent) {
    repliesByParent.set(k, v.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
  }
  const topCount = topComments.length

  // 비공개 곡 안내
  if (!songIsPublic) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-zinc-500 text-sm gap-1 px-6 text-center">
        <p>비공개 곡엔 댓글이 표시되지 않아요</p>
        <p className="text-xs text-zinc-600">곡을 게시하면 댓글을 받을 수 있어요</p>
      </div>
    )
  }

  const meColor = profileColor(profile?.avatarHue ?? 0)
  const meInitial = (profile?.displayName ?? profile?.username ?? user?.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <div className="flex flex-col gap-3">
      {/* 이모지 핫키 */}
      <EmojiHotkeyBar onInsert={insertEmoji} disabled={!currentUserId} />

      {/* 새 댓글 작성 */}
      <div className="flex gap-2.5 items-start">
        <div
          className="w-9 h-9 shrink-0 rounded-full overflow-hidden flex items-center justify-center text-xs font-semibold"
          style={profile?.avatarUrl ? undefined : { background: meColor.bg, color: meColor.text }}
        >
          {profile?.avatarUrl
            ? <Image src={profile.avatarUrl} alt="" width={36} height={36} className="w-full h-full object-cover" unoptimized />
            : meInitial}
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            ref={newInputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            placeholder={currentUserId ? '댓글을 남겨주세요' : '로그인하고 댓글을 남겨보세요'}
            disabled={!currentUserId}
            onClick={() => { if (!currentUserId) onLoginRequired() }}
            className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors resize-none min-h-[72px] disabled:cursor-pointer"
          />
          {body.trim() && (
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setBody('')}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">취소</button>
              <button type="button" onClick={handleSubmit} disabled={submitting || !body.trim()}
                className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors">
                {submitting ? '작성 중…' : '작성'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 카운트 */}
      <div className="flex items-center pt-3 border-t border-white/[0.06]">
        <p className="text-sm text-zinc-400 font-medium">{topCount}개의 댓글</p>
      </div>

      {/* 리스트 */}
      {loading ? (
        <div className="space-y-3 py-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-white/[0.04] shimmer shrink-0" />
              <div className="flex-1 space-y-1.5 py-1">
                <div className="h-3 w-24 rounded bg-white/[0.04] shimmer" />
                <div className="h-3 w-full rounded bg-white/[0.04] shimmer" />
                <div className="h-3 w-3/4 rounded bg-white/[0.04] shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : topCount === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[180px] text-zinc-500 text-sm gap-1 px-6 text-center">
          <p>아직 댓글이 없어요</p>
          <p className="text-xs text-zinc-600">첫 댓글을 남겨보세요</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {topComments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              songOwnerId={songOwnerId}
              currentUserId={currentUserId}
              replies={repliesByParent.get(c.id) ?? []}
              onReplyCreated={handleReplyCreated}
              onEdited={handleEdited}
              onDeleted={handleDeleted}
              onReport={setReporting}
              onLoginRequired={onLoginRequired}
            />
          ))}
        </div>
      )}

      {reporting && (
        <CommentReportModal
          comment={reporting}
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  )
}
