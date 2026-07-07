'use client'

// Design Ref: account-deletion §5.2-5.4 — 2단계 단일 컴포넌트 (stage state)
// Stage 1: 정책 요약 + 7일 grace 안내 → "계속"
// Stage 2: 사유 5종 라디오 + 자유 텍스트(200자) → "탈퇴하기"

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/toast/toast'
import { track, EVENTS } from '@/utils/analytics'
import { BeamBorder } from '@/components/BeamBorder'

interface Props {
  open: boolean
  onClose: () => void
}

type Stage = 'confirm' | 'reason'
type Reason = 'quality' | 'no_ideas' | 'switching' | 'privacy' | 'pause' | 'other'

const REASON_OPTIONS: { value: Reason; label: string }[] = [
  { value: 'quality', label: 'AI 음악 품질이 만족스럽지 못해요' },
  { value: 'no_ideas', label: '만들 곡 아이디어가 더 떠오르지 않아요' },
  { value: 'switching', label: '다른 서비스를 사용하기로 했어요' },
  { value: 'privacy', label: '개인정보·계정 관리 차원에서' },
  { value: 'pause', label: '너무 자주 들어오게 돼서 잠시 끊고 싶어요' },
  { value: 'other', label: '기타' },
]

export function AccountDeletionModal({ open, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('confirm')
  const [reason, setReason] = useState<Reason>('quality')
  const [reasonText, setReasonText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  function handleClose() {
    if (submitting) return
    setStage('confirm')
    setReason('quality')
    setReasonText('')
    onClose()
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_category: reason, reason_text: reasonText.trim() }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        toast.error(body?.error === 'already_deleted'
          ? '이미 탈퇴 처리된 계정이에요'
          : '탈퇴 처리 중 문제가 발생했어요')
        setSubmitting(false)
        return
      }
      track(EVENTS.ACCOUNT_DELETION_REQUEST, { reason_category: reason })
      await createClient().auth.signOut()
      // 작별 페이지로 이동 (감사 멘트 + 7일 grace 안내 + 홈으로 가기 CTA)
      window.location.href = '/farewell'
    } catch (e) {
      console.error('[AccountDeletionModal]', e)
      toast.error('네트워크 오류가 발생했어요')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative z-10 rounded-2xl overflow-hidden w-full max-w-[480px] bg-[#181B22] border border-white/[0.10] shadow-2xl">
        <BeamBorder className="rounded-2xl" durationMs={8000} opacity={0.5} />

        <div className="px-7 py-8">
          {stage === 'confirm' ? (
            <>
              <h2 className="text-xl font-bold text-white mb-3">정말 탈퇴하시겠어요?</h2>
              <p className="text-sm text-zinc-300 leading-relaxed mb-5">
                탈퇴 후 <span className="text-white font-medium">7일 이내</span>에 같은 계정으로 다시 로그인하면 자동으로 복원됩니다.
                <br />
                7일이 지나면 모든 데이터가 <Link href="/policy#section-7" target="_blank" className="underline hover:text-white">운영정책</Link>에 따라 처리되며 되돌릴 수 없어요.
              </p>

              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 mb-6 text-xs text-zinc-400 leading-relaxed">
                · 공개한 곡과 댓글은 <span className="text-zinc-300">"(탈퇴한 회원)"</span>으로 익명 처리되어 유지됩니다<br />
                · 비공개 곡·좋아요·팔로우·알림은 영구 파기됩니다<br />
                · 친구 초대로 받은 보너스 크레딧 통계는 익명으로 보존됩니다
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-sm font-medium text-zinc-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => setStage('reason')}
                  className="flex-1 py-3 rounded-xl bg-white/[0.12] hover:bg-white/[0.18] text-sm font-medium text-white transition-colors"
                >
                  계속
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white mb-2">탈퇴 사유를 알려주세요</h2>
              <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
                여러분의 의견은 서비스 개선에 큰 도움이 됩니다. 익명으로 통계 집계만 됩니다.
              </p>

              <div className="space-y-2 mb-4">
                {REASON_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                      reason === opt.value
                        ? 'bg-white/[0.10] border border-white/[0.18]'
                        : 'bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deletion-reason"
                      value={opt.value}
                      checked={reason === opt.value}
                      onChange={() => setReason(opt.value)}
                      className="sr-only"
                    />
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                      reason === opt.value ? 'border-white' : 'border-zinc-500'
                    } flex items-center justify-center`}>
                      {reason === opt.value && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                    <span className="text-sm text-zinc-200">{opt.label}</span>
                  </label>
                ))}
              </div>

              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value.slice(0, 200))}
                placeholder="더 자세한 의견을 자유롭게 적어주세요 (선택)"
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-zinc-200 placeholder:text-zinc-500 resize-none focus:outline-none focus:border-white/[0.18] transition-colors mb-1"
              />
              <p className="text-right text-xs text-zinc-500 mb-5">{reasonText.length}/200</p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStage('confirm')}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-sm font-medium text-zinc-200 transition-colors disabled:opacity-50"
                >
                  뒤로
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-red-500/90 hover:bg-red-500 text-sm font-semibold text-white transition-colors disabled:opacity-60"
                >
                  {submitting ? '처리 중…' : '탈퇴하기'}
                </button>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleClose}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-black/60 hover:bg-white flex items-center justify-center text-white hover:text-zinc-900 transition-colors"
          aria-label="닫기"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </button>
      </div>
    </div>
  )
}
