'use client'

// CommentReportModal 패턴 그대로 차용. 곡 신고 = 같은 사유 8개.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { reportSong, REPORT_REASONS, type ReportReason } from '@/services/report.service'
import { toast } from '@/components/toast/toast'

interface Props {
  songId: string
  songTitle?: string | null
  onClose: () => void
  onSubmitted?: () => void
}

export function SongReportModal({ songId, songTitle, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null)
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
      await reportSong(songId, reason)
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

  if (typeof document === 'undefined') return null

  return createPortal(
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
          <div className="flex items-center gap-2">
            <Image src="/Flag.svg" alt="" width={18} height={18} style={{ filter: 'invert(1)' }} />
            <p className="text-xl font-semibold text-white">곡 신고</p>
          </div>
          <button onClick={handleClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        {songTitle && (
          <p className="text-xs text-zinc-400 mb-3 truncate">"{songTitle}"</p>
        )}
        <p className="text-xs text-zinc-500 mb-4">신고 사유를 선택해 주세요. 동일 곡을 두 번 이상 신고해도 한 번만 접수됩니다.</p>

        <div className="space-y-1 mb-5">
          {REPORT_REASONS.map((r) => {
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
    </div>,
    document.body,
  )
}
