'use client'
// Design Ref: comments §5.4 — 댓글 신고 모달. 8 사유 라디오 + 제출
// SongEditModal 컨벤션(`[[project-ui-conventions]]`): 모바일 바텀시트·데스크톱 중앙
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { commentService, COMMENT_REPORT_REASONS, type CommentReportReason } from '@/services/comment.service'
import { toast } from '@/components/toast/toast'
import type { Comment } from '@/types/domain'

interface Props {
  comment: Comment
  onClose: () => void
  onSubmitted?: () => void
}

export function CommentReportModal({ comment, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState<CommentReportReason | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  function handleClose() {
    if (submitting) return
    setVisible(false)
    setTimeout(onClose, 280)
  }

  async function handleSubmit() {
    if (!reason || submitting) return
    setSubmitting(true)
    try {
      await commentService.report(comment.id, reason)
      toast.success('신고가 접수되었어요')
      onSubmitted?.()
      setVisible(false)
      setTimeout(onClose, 280)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '신고 접수에 실패했어요'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-6">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-280 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className="relative bg-[#21252E] border border-white/[0.10] rounded-t-2xl md:rounded-2xl w-full max-w-full md:max-w-[420px] max-h-[90vh] overflow-y-auto p-5 shadow-2xl transition-all duration-280 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xl font-semibold text-white">댓글 신고</p>
          <button onClick={handleClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        <p className="text-xs text-zinc-500 mb-4">신고 사유를 선택해 주세요. 동일 댓글을 두 번 이상 신고해도 한 번만 접수됩니다.</p>

        <div className="space-y-1 mb-5">
          {COMMENT_REPORT_REASONS.map((r) => {
            const active = reason === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                  active ? 'bg-white/[0.10] text-white' : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span>{r}</span>
                {active && (
                  <Image src="/Check.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
                )}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!reason || submitting}
          className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              접수 중…
            </>
          ) : '신고하기'}
        </button>
      </div>
    </div>
  )
}
