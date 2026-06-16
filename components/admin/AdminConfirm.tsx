'use client'

// Design Ref: §5.3, §10.4 — 모든 mutation 확인 다이얼로그. 사유 input(5자 이상) 필수.
// Plan SC: (3) 모든 동작에 사유 텍스트 필수

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  variant?: 'default' | 'danger'
  /** 사유 input 표시 여부 (default: true) */
  requireReason?: boolean
  /** 추가 입력 폼 (예: 크레딧 amount input). reason 위에 렌더링. */
  extra?: React.ReactNode
  onClose: () => void
  /** reason 검증 통과 후 호출. 비동기 작업 가능. */
  onConfirm: (reason: string) => Promise<void> | void
}

const MIN_REASON = 5

export function AdminConfirm({
  open,
  title,
  description,
  confirmLabel = '확인',
  variant = 'default',
  requireReason = true,
  extra,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setReason('')
      setError('')
      setBusy(false)
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const canSubmit = requireReason ? reason.trim().length >= MIN_REASON : true

  async function handleConfirm() {
    if (!canSubmit || busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(reason.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 중 오류가 발생했어요')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={!busy ? onClose : undefined} />
      <div className="relative bg-white border border-[#ebebeb] rounded-lg w-full max-w-[420px] shadow-xl p-6">
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        {description && <p className="text-sm text-zinc-600 mt-1.5">{description}</p>}

        {extra && <div className="mt-4">{extra}</div>}

        {requireReason && (
          <div className="mt-4 space-y-1.5">
            <label className="text-xs text-zinc-500">사유 (5자 이상)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={200}
              autoFocus
              placeholder="감사 로그에 기록됩니다"
              className="w-full bg-zinc-50 border border-[#ebebeb] rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-[#0070f3] transition-colors resize-none"
            />
            <p className="text-[11px] text-zinc-400 text-right tabular-nums">{reason.length}/200</p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              variant === 'danger'
                ? 'bg-[#ee0000] hover:bg-[#c50000]'
                : 'bg-[#171717] hover:bg-[#383838]'
            }`}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
