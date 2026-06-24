// 크레딧 충전 모달 — 2단계: ① 팩 선택 → ② 정보 확인(이메일·휴대폰·동의) → 이니시스 결제창.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { requestPayment } from '@portone/browser-sdk/v2'
import { toast } from '@/components/toast/toast'
import { useAuth } from '@/components/AuthProvider'
import { CREDIT_PRODUCT_LIST, type CreditProduct } from '@/lib/credit-products'

interface Props {
  open: boolean
  onClose: () => void
}

const SONG_COST = 10
const BASE_PER_CR = CREDIT_PRODUCT_LIST[0].amount / CREDIT_PRODUCT_LIST[0].credits

function discountPct(p: CreditProduct): number {
  return Math.round((1 - (p.amount / p.credits) / BASE_PER_CR) * 100)
}

export function CreditPurchaseModal({ open, onClose }: Props) {
  const { user, profile } = useAuth()
  const [step, setStep] = useState<'select' | 'confirm'>('select')
  const [selected, setSelected] = useState<CreditProduct | null>(null)
  const [phone, setPhone] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  // 열릴 때 단계·동의 초기화 (휴대폰은 재사용 위해 유지)
  useEffect(() => {
    if (open) { setStep('select'); setSelected(null); setAgreed(false); setBusy(false) }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const phoneDigits = phone.replace(/[^0-9]/g, '')
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.startsWith('01')
  const email = user?.email ?? ''

  function pickPack(p: CreditProduct) {
    // 결제 비활성(심사 전)에는 상품만 노출하고 실제 구매는 막음
    if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== 'true') {
      toast.info('크레딧 구매는 준비 중이에요')
      return
    }
    setSelected(p)
    setStep('confirm')
  }

  async function pay() {
    if (busy || !selected) return
    if (!email) { toast.error('결제를 위해 이메일이 필요해요. 다시 로그인해 주세요'); return }
    if (!phoneValid) { toast.error('휴대폰 번호를 정확히 입력해 주세요'); return }
    if (!agreed) { toast.error('결제 진행에 동의해 주세요'); return }
    setBusy(true)
    try {
      const prep = await fetch('/api/payments/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productCode: selected.code }),
      }).then((r) => r.json())

      if (!prep?.paymentId) { toast.error('결제 준비에 실패했어요'); return }
      if (!prep.storeId || !prep.channelKey) { toast.error('결제 설정이 준비 중이에요'); return }

      const res = await requestPayment({
        storeId: prep.storeId,
        channelKey: prep.channelKey,
        paymentId: prep.paymentId,
        orderName: prep.orderName,
        totalAmount: prep.amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customer: {
          email,
          fullName: profile?.displayName ?? user?.user_metadata?.full_name ?? undefined,
          phoneNumber: phoneDigits,
        },
      })

      // 사용자 취소·결제 실패 — ready 건 정리(fire-and-forget)
      if (res?.code) {
        fetch('/api/payments/abandon', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: prep.paymentId }),
        }).catch(() => {})
        toast.error(res.message || '결제가 취소됐어요')
        return
      }

      const v = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: prep.paymentId }),
      }).then((r) => r.json())

      if (!v?.ok) { toast.error('결제 검증에 실패했어요. 잠시 후 자동 반영되거나 문의해 주세요'); return }
      if (v.creditState) window.dispatchEvent(new CustomEvent('credits-updated', { detail: v.creditState }))
      toast.success(`${selected.credits.toLocaleString()}크레딧이 충전됐어요`)
      onClose()
    } catch (e) {
      console.error('[credit purchase]', e)
      toast.error('결제 처리 중 오류가 발생했어요')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl w-full max-w-[420px] shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          {step === 'confirm' && (
            <button
              onClick={busy ? undefined : () => setStep('select')}
              aria-label="뒤로"
              className="-ml-1 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition active:scale-90"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white">{step === 'select' ? '크레딧 충전' : '결제 정보 확인'}</h2>
            {step === 'select' && <p className="mt-1 text-xs text-zinc-400">곡·영상 생성에 사용돼요. 구매 크레딧은 소멸되지 않아요.</p>}
          </div>
          <button
            onClick={busy ? undefined : onClose}
            aria-label="닫기"
            className="-mr-1 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition active:scale-90"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {step === 'select' ? (
          <>
            {/* 팩 목록 */}
            <div className="px-4 pb-3 space-y-2">
              {CREDIT_PRODUCT_LIST.map((p) => {
                const dc = discountPct(p)
                return (
                  <button
                    key={p.code}
                    onClick={() => pickPack(p)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/20 transition active:scale-[0.99] text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-white tabular-nums">{p.credits.toLocaleString()}</span>
                        <span className="text-xs text-zinc-400">크레딧</span>
                        {dc > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-600/20 text-violet-300 leading-none">{dc}% 할인</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">음악 약 {Math.floor(p.credits / SONG_COST)}곡</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-white tabular-nums">₩{p.amount.toLocaleString()}</span>
                  </button>
                )
              })}
            </div>
            <p className="px-5 pb-5 pt-1 text-[11px] text-zinc-500">
              결제 후 크레딧이 즉시 지급돼요. 모든 가격은 VAT 포함이며, 사전 고지 후 변경될 수 있어요.
            </p>
          </>
        ) : (
          <div className="px-5 pb-5 space-y-4">
            {/* 주문 요약 */}
            {selected && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <div>
                  <p className="text-sm font-semibold text-white">{selected.credits.toLocaleString()}크레딧</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">음악 약 {Math.floor(selected.credits / SONG_COST)}곡</p>
                </div>
                <span className="text-base font-bold text-white tabular-nums">₩{selected.amount.toLocaleString()}</span>
              </div>
            )}

            {/* 이메일 (자동) */}
            <div>
              <label className="text-[11px] text-zinc-400">이메일</label>
              <input
                type="email"
                value={email}
                readOnly
                className="mt-1 w-full bg-white/[0.02] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-300 cursor-default focus:outline-none"
              />
            </div>

            {/* 휴대폰 (필수) */}
            <div>
              <label className="text-[11px] text-zinc-400">휴대폰 번호 <span className="text-violet-400">*</span></label>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                disabled={busy}
                className="mt-1 w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 disabled:opacity-50"
              />
            </div>

            {/* 필수 동의 */}
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={busy}
                className="mt-0.5 w-4 h-4 accent-violet-500 shrink-0"
              />
              <span className="text-[12px] text-zinc-300 leading-snug">
                주문 내용을 확인했으며, 결제 진행 및{' '}
                <a href="/terms#payment" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline underline-offset-2">환불 정책</a>
                에 동의합니다. (필수)
              </span>
            </label>

            {/* 결제 진행 */}
            <button
              onClick={pay}
              disabled={busy || !phoneValid || !agreed}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100"
            >
              {busy ? '처리 중…' : selected ? `₩${selected.amount.toLocaleString()} 결제 진행` : '결제 진행'}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">VAT 포함 · 결제 후 크레딧 즉시 지급</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
