// 어카운트(마이페이지) — 계정정보 · 결제내역/환불신청 · 탈퇴 · 로그아웃
'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { AccountDeletionModal } from '@/components/AccountDeletionModal'
import { PushToggle } from '@/components/PushToggle'
import { toast } from '@/components/toast/toast'

// 더보기(푸터) 항목 — 모바일에서 접근 경로 확보 위해 내 계정에도 노출
const INFO_LINKS: { href: string; label: string; icon: string; external?: boolean; mail?: boolean }[] = [
  { href: '/announcements', label: "What's New", icon: '/Sparkles.svg' },
  { href: '/terms', label: '이용약관', icon: '/terms.png', external: true },
  { href: '/privacy', label: '개인정보처리방침', icon: '/security-policy.png', external: true },
  { href: '/policy', label: '운영정책', icon: '/policy.png', external: true },
  { href: '/help', label: '도움말', icon: '/Help.png', external: true },
  { href: '/faq', label: '자주 묻는 질문', icon: '/faq.png', external: true },
  { href: 'mailto:bee202408@gmail.com', label: '문의하기', icon: '/costumer.png', mail: true },
]

interface MyPayment {
  paymentId: string
  orderName: string
  amount: number
  credits: number
  status: string
  refundedCredits: number
  refundRequestedAt: string | null
  createdAt: string
  receiptUrl: string | null
}

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true'

const PROVIDER_LABEL: Record<string, string> = {
  google: '구글', kakao: '카카오', naver: '네이버', apple: '애플', email: '이메일',
}

const STATUS: Record<string, { label: string; cls: string }> = {
  ready:     { label: '미완료',   cls: 'bg-amber-500/15 text-amber-300' },
  paid:      { label: '결제완료', cls: 'bg-emerald-500/15 text-emerald-300' },
  cancelled: { label: '취소됨',   cls: 'bg-white/10 text-zinc-400' },
  refunded:  { label: '환불됨',   cls: 'bg-white/10 text-zinc-400' },
  failed:    { label: '실패',     cls: 'bg-red-500/15 text-red-300' },
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function AccountPage() {
  const router = useRouter()
  const { user, profile, signOut } = useAuth()
  const [payments, setPayments] = useState<MyPayment[] | null>(null)
  const [deletionOpen, setDeletionOpen] = useState(false)
  const [refundTarget, setRefundTarget] = useState<MyPayment | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const loadPayments = useCallback(async () => {
    const res = await fetch('/api/payments/me')
    if (!res.ok) { setPayments([]); return }
    const json = await res.json()
    setPayments(json.data ?? [])
  }, [])

  useEffect(() => { if (user && PAYMENTS_ENABLED) loadPayments() }, [user, loadPayments])

  async function submitRefund() {
    if (!refundTarget || busy) return
    if (reason.trim().length < 5) { toast.error('환불 사유를 5자 이상 입력해 주세요'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/payments/${refundTarget.paymentId}/refund-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j.error === 'not_eligible' ? '환불 신청할 수 없는 결제예요' : '신청에 실패했어요')
        return
      }
      toast.success('환불 신청이 접수됐어요. 검토 후 처리됩니다.')
      setRefundTarget(null); setReason('')
      loadPayments()
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <button onClick={() => window.dispatchEvent(new Event('open-login'))} className="text-sm text-white border border-white/25 px-4 py-2 rounded-full hover:bg-white/[0.08]">로그인</button>
      </div>
    )
  }

  const provider = (user.app_metadata?.provider as string) || 'email'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-5 py-6 space-y-8">
        <h1 className="text-2xl font-bold text-white">내 계정</h1>

        {/* 계정정보 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400">계정 정보</h2>
          <dl className="rounded-2xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.06]">
            <Row label="닉네임" value={profile?.displayName ?? '-'} />
            <Row label="이메일" value={user.email ?? '-'} />
            <Row label="로그인 수단" value={PROVIDER_LABEL[provider] ?? provider} />
            <Row label="가입일" value={user.created_at ? fmt(user.created_at) : '-'} />
          </dl>
        </section>

        {/* 결제내역 — 결제 기능 활성화 시에만 노출 */}
        {PAYMENTS_ENABLED && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400">결제 내역</h2>
          {payments === null ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 rounded-xl bg-white/[0.04] shimmer" />)}</div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">결제 내역이 없어요.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => {
                const st = STATUS[p.status] ?? { label: p.status, cls: 'bg-white/10 text-zinc-400' }
                const canRequest = p.status === 'paid' && !p.refundRequestedAt
                return (
                  <div key={p.paymentId} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.orderName}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{fmt(p.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                        <span className="text-sm font-semibold text-white tabular-nums">₩{p.amount.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 mt-2">
                      {p.receiptUrl && (
                        <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 hover:text-white underline underline-offset-2">영수증</a>
                      )}
                      {canRequest ? (
                        <button onClick={() => { setRefundTarget(p); setReason('') }} className="text-[11px] font-semibold text-zinc-300 hover:text-white px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] transition">환불 신청</button>
                      ) : p.refundRequestedAt && p.status === 'paid' ? (
                        <span className="text-[11px] text-amber-300">환불 신청됨 · 검토 중</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        )}

        {/* 계정 관리 */}
        <section className="space-y-2 pt-2">
          <PushToggle />

          {/* 이용 안내 · 지원 (모바일 접근 경로 — 더보기와 동일 항목). 한 컨테이너로 묶고 내부 divide-y */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.06]">
            {INFO_LINKS.map((it) => {
              const rowCls = 'w-full flex items-center justify-between gap-2 px-4 py-4 text-sm text-white hover:bg-white/[0.05] transition'
              const inner = (
                <>
                  <span className="flex items-center gap-2.5">
                    <Image src={it.icon} alt="" width={16} height={16} style={{ filter: 'invert(1) brightness(0.85)' }} />
                    {it.label}
                  </span>
                  {it.external && <Image src="/External-Link.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4)' }} />}
                </>
              )
              if (it.mail) return <a key={it.href} href={it.href} className={rowCls}>{inner}</a>
              if (it.external) return <a key={it.href} href={it.href} target="_blank" rel="noopener noreferrer" className={rowCls}>{inner}</a>
              return <Link key={it.href} href={it.href} className={rowCls}>{inner}</Link>
            })}
          </div>

          <button
            onClick={() => { signOut(); router.push('/') }}
            className="w-full text-left px-4 py-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-sm text-white hover:bg-white/[0.05] transition"
          >
            로그아웃
          </button>
          <button
            onClick={() => setDeletionOpen(true)}
            className="w-full text-left px-4 py-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-sm text-red-400 hover:bg-red-500/[0.06] transition"
          >
            회원 탈퇴
          </button>
        </section>
      </div>

      <AccountDeletionModal open={deletionOpen} onClose={() => setDeletionOpen(false)} />

      {/* 환불 신청 모달 */}
      {refundTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : () => setRefundTarget(null)} />
          <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl w-full max-w-[360px] p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-white">환불 신청</h3>
            <p className="mt-1 text-xs text-zinc-400">{refundTarget.orderName} · ₩{refundTarget.amount.toLocaleString()}</p>
            <p className="mt-2 text-[11px] text-zinc-500">미사용 크레딧만 환불됩니다(사용분 제외). 회사 귀책·오류는 전액 환불돼요. 검토 후 처리됩니다.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="환불 사유를 입력해 주세요 (5자 이상)"
              className="mt-3 w-full h-20 bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={busy ? undefined : () => setRefundTarget(null)} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition disabled:opacity-40">취소</button>
              <button onClick={submitRefund} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-40">{busy ? '접수 중…' : '신청하기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-4">
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="text-sm text-white truncate ml-3">{value}</dd>
    </div>
  )
}
