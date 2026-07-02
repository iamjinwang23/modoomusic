'use client'
// 커뮤니티 글 댓글 아이템 — 노래 댓글과 동일 패턴(좋아요·답글·인라인 편집·더보기 수정/삭제·중첩 replies)
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import { relativeTime } from '@/utils/relativeTime'
import { ConfirmModal } from '@/components/ConfirmModal'
import type { CommunityPostComment } from '@/types/domain'

interface Props {
  comment: CommunityPostComment
  currentUserId: string | null
  isManager: boolean               // 커뮤니티 매니저면 어떤 댓글이든 삭제 가능
  isReply?: boolean
  onMutated: () => void            // 추가/수정/삭제 후 목록 새로고침
  gate: () => boolean              // 참여 가능 여부(로그인+가입) — false면 자체 안내 처리
}

export function CommunityCommentItem({ comment, currentUserId, isManager, isReply = false, onMutated, gate }: Props) {
  const isOwner = currentUserId === comment.authorId
  const canDelete = isOwner || isManager

  const [liked, setLiked] = useState(comment.liked)
  const [likeCount, setLikeCount] = useState(comment.likeCount)
  const [likeBusy, setLikeBusy] = useState(false)
  useEffect(() => { setLiked(comment.liked); setLikeCount(comment.likeCount) }, [comment.liked, comment.likeCount])

  const [moreOpen, setMoreOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [replySaving, setReplySaving] = useState(false)

  const fallback = profileColor(comment.user.avatarHue ?? 0)
  const initial = (comment.user.displayName ?? comment.user.username ?? '?').slice(0, 1).toUpperCase()
  const avatarSize = isReply ? 24 : 28

  async function handleEditSave() {
    const text = editBody.trim()
    if (!text || text.length > 500 || editSaving) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/community-comments/${comment.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error === 'banned_word' ? '부적절한 표현이 포함되어 있어요' : '수정에 실패했어요'); return }
      setEditOpen(false)
      onMutated()
    } catch { toast.error('수정에 실패했어요') } finally { setEditSaving(false) }
  }

  async function handleDelete() {
    setConfirmDel(false)
    try {
      const res = await fetch(`/api/community-comments/${comment.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.info('댓글이 삭제되었어요')
      onMutated()
    } catch { toast.error('삭제에 실패했어요') }
  }

  async function handleLike() {
    if (likeBusy) return
    if (!gate()) return
    const prevLiked = liked, prevCount = likeCount
    setLiked(!prevLiked); setLikeCount(prevCount + (prevLiked ? -1 : 1))
    setLikeBusy(true)
    try {
      const res = await fetch(`/api/community-comments/${comment.id}/like`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const j = await res.json()
      setLiked(j.liked); setLikeCount(j.likeCount)
    } catch {
      setLiked(prevLiked); setLikeCount(prevCount)
      toast.error('좋아요에 실패했어요')
    } finally { setLikeBusy(false) }
  }

  async function handleReplySubmit() {
    const text = replyBody.trim()
    if (!text || text.length > 500 || replySaving) return
    if (!gate()) return
    setReplySaving(true)
    try {
      const res = await fetch(`/api/community-posts/${comment.postId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text, parentId: comment.id }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error === 'banned_word' ? '부적절한 표현이 포함되어 있어요' : '답글 작성에 실패했어요'); return }
      setReplyBody(''); setReplyOpen(false)
      onMutated()
    } catch { toast.error('답글 작성에 실패했어요') } finally { setReplySaving(false) }
  }

  const goProfile = () => { if (comment.user.username) window.dispatchEvent(new CustomEvent('view-profile', { detail: comment.user.username })) }

  return (
    <div className={`flex gap-2.5 ${isReply ? 'mt-3' : ''}`}>
      <button onClick={goProfile} disabled={!comment.user.username} className="shrink-0 rounded-full overflow-hidden flex items-center justify-center font-semibold disabled:cursor-default transition active:scale-95"
        style={{ width: avatarSize, height: avatarSize, fontSize: avatarSize * 0.42, ...(comment.user.avatarUrl ? {} : { background: fallback.bg, color: fallback.text }) }}>
        {comment.user.avatarUrl
          ? <Image src={comment.user.avatarUrl} alt="" width={avatarSize} height={avatarSize} className="w-full h-full object-cover" unoptimized />
          : initial}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={goProfile} disabled={!comment.user.username} className="text-xs font-semibold text-white truncate hover:underline disabled:no-underline disabled:cursor-default">{comment.user.displayName ?? comment.user.username}</button>
          <span className="shrink-0 text-[11px] text-zinc-500">· {relativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span className="shrink-0 text-[11px] text-zinc-600">(수정됨)</span>}
        </div>

        {editOpen ? (
          <div className="mt-1.5 space-y-2">
            <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={500} autoFocus
              className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors resize-none min-h-[64px]" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditOpen(false); setEditBody(comment.body) }} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">취소</button>
              <button type="button" onClick={handleEditSave} disabled={editSaving || !editBody.trim()} className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition active:scale-[0.96]">{editSaving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap break-words mt-0.5">{comment.body}</p>
        )}

        {!editOpen && (
          <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
            <button type="button" onClick={handleLike} disabled={likeBusy} className={`flex items-center gap-1 transition-colors ${liked ? 'text-red-500' : 'hover:text-white'}`} aria-label={liked ? '좋아요 취소' : '좋아요'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
            </button>
            {!isReply && (
              <button type="button" onClick={() => { if (!gate()) return; setReplyOpen((v) => !v) }} className="hover:text-white transition-colors">답글달기</button>
            )}
            {(isOwner || canDelete) && (
              <div className="relative ml-auto">
                <button type="button" onClick={() => setMoreOpen((v) => !v)} className="w-6 h-6 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-zinc-500 hover:text-white transition-colors" aria-label="더보기">⋯</button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-[54]" onClick={() => setMoreOpen(false)} />
                    <div className="absolute right-0 top-7 z-[55] w-28 bg-[#282D38] border border-white/[0.08] rounded-xl py-1 shadow-xl overflow-hidden">
                      {isOwner && (
                        <button type="button" onClick={() => { setMoreOpen(false); setEditOpen(true) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition-colors">
                          <Image src="/Edit.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.55)' }} /> 수정
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => { setMoreOpen(false); setConfirmDel(true) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                          <Image src="/Delete-2.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 삭제
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {replyOpen && !isReply && (
          <div className="mt-2.5 space-y-2">
            <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} maxLength={500} autoFocus placeholder="답글을 남겨주세요"
              className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors resize-none min-h-[56px]" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setReplyOpen(false); setReplyBody('') }} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">취소</button>
              <button type="button" onClick={handleReplySubmit} disabled={replySaving || !replyBody.trim()} className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition active:scale-[0.96]">{replySaving ? '작성 중…' : '답글'}</button>
            </div>
          </div>
        )}

        {!isReply && (comment.replies?.length ?? 0) > 0 && (
          <div className="mt-2 pl-3 border-l border-white/[0.06]">
            {comment.replies!.map((r) => (
              <CommunityCommentItem key={r.id} comment={r} currentUserId={currentUserId} isManager={isManager} isReply onMutated={onMutated} gate={gate} />
            ))}
          </div>
        )}
      </div>

      <ConfirmModal open={confirmDel} title="이 댓글을 정말 삭제하시겠어요?" description={isReply ? '삭제하면 되돌릴 수 없어요.' : '삭제 시 등록된 대댓글도 함께 삭제돼요.'} confirmLabel="삭제하기" cancelLabel="아니요" variant="danger" onConfirm={handleDelete} onClose={() => setConfirmDel(false)} />
    </div>
  )
}
