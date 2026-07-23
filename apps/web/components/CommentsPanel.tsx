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
import { getMyReportedCommentIds } from '@/services/report.service'
import { EmojiHotkeyBar } from './EmojiHotkeyBar'
import type { Comment } from '@mono/shared'

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

  // 한 줄로 시작 → 내용 따라 최대 4줄까지 자동 확장. border 2px 보정으로 단일 줄 스크롤바 방지.
  useEffect(() => {
    const el = newInputRef.current
    if (!el) return
    el.style.height = 'auto'
    const MAX = 112
    const next = el.scrollHeight + 2  // border-box: scrollHeight엔 테두리 미포함
    el.style.height = `${Math.min(next, MAX)}px`
    el.style.overflowY = next > MAX ? 'auto' : 'hidden'
  }, [body])

  useEffect(() => {
    if (!songIsPublic) { setLoading(false); setComments([]); return }
    let cancelled = false
    setLoading(true)
    Promise.all([
      commentService.listForSong(songId),
      getMyReportedCommentIds(),
    ])
      .then(([list, reportedSet]) => {
        if (cancelled) return
        // 신고자 본인이 신고한 댓글(top·reply 무관)은 새로고침 후 목록에서 제외
        setComments(list.filter((c) => !reportedSet.has(c.id)))
      })
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
    // 답글도 카운트에 포함(IG/TikTok식) — mig 062
    window.dispatchEvent(new CustomEvent('song-comment-count-changed', { detail: { songId, delta: 1 } }))
  }
  function handleEdited(next: Comment) {
    setComments((prev) => prev.map((c) => c.id === next.id ? next : c))
  }
  function handleDeleted(id: string) {
    const deleted = comments.find((c) => c.id === id)
    // 답글 포함 카운트(mig 062): top-level 삭제 시 자신 + 딸린 답글(cascade)만큼, 답글 삭제는 -1.
    const replyCount = comments.filter((c) => c.parentId === id).length
    setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id))
    if (deleted) {
      const delta = deleted.parentId === null ? -(1 + replyCount) : -1
      window.dispatchEvent(new CustomEvent('song-comment-count-changed', { detail: { songId, delta } }))
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
        <p className="text-xs text-zinc-600">곡을 공개하면 댓글을 받을 수 있어요</p>
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
          className="relative w-9 h-9 shrink-0 rounded-full overflow-hidden flex items-center justify-center text-xs font-semibold"
          style={profile?.avatarUrl ? undefined : { background: meColor.bg, color: meColor.text }}
        >
          {profile?.avatarUrl
            ? <Image src={profile.avatarUrl} alt="" width={36} height={36} className="w-full h-full object-cover" unoptimized />
            : meInitial}
          <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/[0.08]" />
        </div>
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={newInputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={1}
            maxLength={500}
            placeholder={currentUserId ? '댓글을 남겨주세요' : '로그인하고 댓글을 남겨보세요'}
            disabled={!currentUserId}
            onClick={() => { if (!currentUserId) onLoginRequired() }}
            className="block w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-[20px] pl-4 pr-12 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors resize-none disabled:cursor-pointer overflow-hidden leading-5"
          />
          <button type="button" onClick={handleSubmit} disabled={submitting || !body.trim()} aria-label="댓글 등록"
            className={`absolute bottom-[3px] right-[3px] w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 disabled:hover:bg-violet-600 flex items-center justify-center transition duration-200 active:scale-90 ${body.trim() ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}>
            {submitting
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
          </button>
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
          onSubmitted={() => {
            // 신고 즉시 본인 view에서 해당 댓글 제거 (블라인드 처리)
            const reportedId = reporting.id
            setComments((prev) => prev.filter((c) => c.id !== reportedId))
          }}
        />
      )}
    </div>
  )
}
