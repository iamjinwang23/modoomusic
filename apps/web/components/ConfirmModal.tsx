'use client'

// 범용 확인 모달 — 곡 삭제·공개 취소·컬렉션 삭제·댓글 삭제·가사 교체 등
// 파괴적/되돌릴 수 없는 액션의 확인을 하나의 디자인으로 통일.
// (어드민 전용 사유 입력형은 AdminConfirm 별도 유지)
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  busy?: boolean
  /** 다른 모달 위에 띄워야 할 때 z 레이어 오버라이드 (기본 z-[70]) */
  zClassName?: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'default',
  busy = false,
  zClassName = 'z-[70]',
  onConfirm,
  onClose,
}: Props) {
  if (!open || typeof document === 'undefined') return null

  const confirmColor = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-500'
    : 'bg-violet-600 hover:bg-violet-500'

  return createPortal(
    <div className={`fixed inset-0 ${zClassName} flex items-center justify-center p-6`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
        <p className="text-sm font-semibold text-white mb-1">{title}</p>
        {description && <p className="text-xs text-zinc-400 mb-5 whitespace-pre-wrap">{description}</p>}
        {!description && <div className="mb-5" />}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition active:scale-[0.96] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-5 py-2 rounded-xl text-sm font-semibold text-white transition active:scale-[0.96] disabled:opacity-50 ${confirmColor}`}
          >
            {busy ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
