'use client'
// Design Ref: comments §5.3 — 댓글 아이템 (헤더·본문·액션·인라인 편집/답글·중첩 replies)
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { commentService, formatRelativeKo } from '@/services/comment.service'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import { ConfirmModal } from '@/components/ConfirmModal'
import type { Comment } from '@mono/shared'

interface Props {
  comment: Comment
  songOwnerId: string | null
  currentUserId: string | null
  replies?: Comment[]                  // top-level일 때만
  isReply?: boolean
  onReplyCreated?: (next: Comment) => void
  onEdited: (next: Comment) => void
  onDeleted: (id: string) => void
  onReport: (comment: Comment) => void
  onLoginRequired: () => void
  onRegisterInput?: (input: HTMLTextAreaElement | null) => void   // 활성 input 추적 (이모지 핫키)
}

export function CommentItem({
  comment, songOwnerId, currentUserId, replies = [], isReply = false,
  onReplyCreated, onEdited, onDeleted, onReport, onLoginRequired, onRegisterInput,
}: Props) {
  const isOwner = currentUserId === comment.userId
  const isCreator = songOwnerId === comment.userId

  const [liked, setLiked] = useState(comment.liked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [likeBusy, setLikeBusy] = useState(false)

  const [moreOpen, setMoreOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [replySaving, setReplySaving] = useState(false)

  // 10줄 초과 시 더보기/접기 토글
  const [expanded, setExpanded] = useState(false)
  const bodyLines = comment.body.split('\n')
  const isLong = bodyLines.length > 10
  const visibleBody = isLong && !expanded ? bodyLines.slice(0, 10).join('\n') : comment.body

  // 외부 사용자명/아바타에서 comment 변경 시 동기화
  useEffect(() => { setLiked(comment.liked); setLikeCount(comment.likeCount) }, [comment.liked, comment.likeCount])

  function goProfile() {
    window.dispatchEvent(new CustomEvent('view-profile', { detail: comment.user.username }))
  }

  async function handleLike() {
    if (likeBusy) return
    if (!currentUserId) { onLoginRequired(); return }
    const prevLiked = liked, prevCount = likeCount
    setLiked(!prevLiked)
    setLikeCount(prevCount + (prevLiked ? -1 : 1))
    setLikeBusy(true)
    try {
      const r = await commentService.toggleLike(comment.id)
      setLiked(r.liked); setLikeCount(r.likeCount)
    } catch {
      setLiked(prevLiked); setLikeCount(prevCount)
      toast.error('좋아요에 실패했어요')
    } finally { setLikeBusy(false) }
  }

  async function handleEditSave() {
    const text = editBody.trim()
    if (!text || text.length > 1000 || editSaving) return
    setEditSaving(true)
    try {
      const next = await commentService.update(comment.id, text)
      onEdited(next)
      setEditOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수정에 실패했어요')
    } finally { setEditSaving(false) }
  }

  async function handleDelete() {
    setConfirmDel(false)
    try {
      await commentService.remove(comment.id)
      onDeleted(comment.id)
      toast.info('댓글이 삭제되었어요')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제에 실패했어요')
    }
  }

  async function handleReplySubmit() {
    const text = replyBody.trim()
    if (!text || text.length > 1000 || replySaving) return
    if (!currentUserId) { onLoginRequired(); return }
    setReplySaving(true)
    try {
      const next = await commentService.reply(comment.id, text)
      onReplyCreated?.(next)
      setReplyBody('')
      setReplyOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '답글 작성에 실패했어요')
    } finally { setReplySaving(false) }
  }

  const avatarSize = isReply ? 'w-8 h-8 text-[11px]' : 'w-9 h-9 text-xs'
  const avatarPx = isReply ? 32 : 36
  const fallback = profileColor(comment.user.avatarHue ?? 0)
  const initial = (comment.user.displayName ?? comment.user.username ?? '?').slice(0, 1).toUpperCase()

  return (
    <div className={`flex gap-3 ${isReply ? 'mt-3' : 'py-4'}`}>
      <button
        type="button"
        onClick={goProfile}
        className={`relative ${avatarSize} shrink-0 rounded-full overflow-hidden flex items-center justify-center font-semibold hover:opacity-80 transition-opacity`}
        style={comment.user.avatarUrl ? undefined : { background: fallback.bg, color: fallback.text }}
        aria-label={`${comment.user.displayName ?? comment.user.username} 프로필 보기`}
      >
        {comment.user.avatarUrl
          ? <Image src={comment.user.avatarUrl} alt="" width={avatarPx} height={avatarPx} className="w-full h-full object-cover" unoptimized />
          : initial}
        <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/[0.08]" />
      </button>

      <div className="flex-1 min-w-0">
        {/* 헤더 */}
        <div className="flex items-center gap-1.5 mb-1 min-w-0">
          <button type="button" onClick={goProfile} className="text-sm font-semibold text-white truncate hover:underline">
            {comment.user.displayName ?? comment.user.username}
          </button>
          {isCreator && (
            <span className="shrink-0 text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full leading-none">작성자</span>
          )}
          <span className="shrink-0 text-xs text-zinc-500">· {formatRelativeKo(comment.createdAt)}</span>
          {comment.editedAt && <span className="shrink-0 text-xs text-zinc-600">(수정됨)</span>}
        </div>

        {/* 본문 또는 편집 */}
        {editOpen ? (
          <div className="space-y-2">
            <textarea
              ref={(el) => { onRegisterInput?.(el); if (el) el.focus() }}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              maxLength={500}
              className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors resize-none min-h-[72px]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditOpen(false); setEditBody(comment.body) }}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">취소</button>
              <button type="button" onClick={handleEditSave} disabled={editSaving || !editBody.trim()}
                className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition active:scale-[0.96]">
                {editSaving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-white leading-relaxed whitespace-pre-wrap break-words">{visibleBody}</p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 inline-flex items-center gap-0.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                {expanded ? '접기' : '더보기'}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={expanded ? 'M3 7.5L6 4.5L9 7.5' : 'M3 4.5L6 7.5L9 4.5'} />
                </svg>
              </button>
            )}
          </>
        )}

        {/* 액션 */}
        {!editOpen && (
          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
            <button type="button" onClick={handleLike} disabled={likeBusy}
              className={`flex items-center gap-1 transition-colors ${liked ? 'text-red-500' : 'hover:text-white'}`}
              aria-label={liked ? '좋아요 취소' : '좋아요'}>
              <svg width="14" height="14" viewBox="0 0 24 24"
                fill={liked ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
            </button>
            {!isReply && (
              <button type="button" onClick={() => {
                if (!currentUserId) { onLoginRequired(); return }
                setReplyOpen((v) => !v)
              }} className="hover:text-white transition-colors">
                답글달기
              </button>
            )}
            <div className="relative ml-auto">
              <button type="button" onClick={() => setMoreOpen((v) => !v)}
                className="w-6 h-6 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                aria-label="더보기">⋯</button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-[54]" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-7 z-[55] w-32 bg-[#282D38] border border-white/[0.08] rounded-xl py-1 shadow-xl overflow-hidden">
                    {isOwner ? (
                      <>
                        <button type="button" onClick={() => { setMoreOpen(false); setEditOpen(true) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition-colors">
                          <Image src="/Edit.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.55)' }} /> 수정
                        </button>
                        <button type="button" onClick={() => { setMoreOpen(false); setConfirmDel(true) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                          <Image src="/Delete-2.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 삭제
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => {
                        setMoreOpen(false)
                        if (!currentUserId) { onLoginRequired(); return }
                        onReport(comment)
                      }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                        <Image src="/Flag.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 신고
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 답글 입력 (top-level일 때만) */}
        {replyOpen && !isReply && (
          <div className="mt-3 space-y-2">
            <textarea
              ref={(el) => { onRegisterInput?.(el); if (el) el.focus() }}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              maxLength={500}
              placeholder="답글을 남겨주세요"
              className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors resize-none min-h-[64px]"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setReplyOpen(false); setReplyBody('') }}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">취소</button>
              <button type="button" onClick={handleReplySubmit} disabled={replySaving || !replyBody.trim()}
                className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition active:scale-[0.96]">
                {replySaving ? '작성 중…' : '답글'}
              </button>
            </div>
          </div>
        )}

        {/* 대댓글 — top-level만 렌더 */}
        {!isReply && replies.length > 0 && (
          <div className="mt-2 pl-3 border-l border-white/[0.06] space-y-0">
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                songOwnerId={songOwnerId}
                currentUserId={currentUserId}
                isReply
                onEdited={onEdited}
                onDeleted={onDeleted}
                onReport={onReport}
                onLoginRequired={onLoginRequired}
                onRegisterInput={onRegisterInput}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmDel}
        title="이 댓글을 정말 삭제하시겠어요?"
        description="삭제 시 등록된 대댓글도 함께 삭제돼요."
        confirmLabel="삭제하기"
        cancelLabel="아니요"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setConfirmDel(false)}
      />
    </div>
  )
}
