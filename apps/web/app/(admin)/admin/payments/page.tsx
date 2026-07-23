// 결제/취소/지급 내역 + 문의 대응 취소(환불). Design Ref: 결제 모듈.
'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { toast } from '@/components/toast/toast'

type RefundMode = 'normal' | 'company_fault'

interface PaymentRow {
  paymentId: string
  userId: string
  userName: string | null
  productCode: string
  orderName: string
  amount: number
  credits: number
  status: string
  paidAt: string | null
  cancelledAt: string | null
  refundedCredits: number
  refundRequestedAt: string | null
  refundRequestReason: string | null
  createdAt: string
  transactionId: string | null
  pgTxId: string | null
  approvalNumber: string | null
  receiptUrl: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  ready:     { label: '대기',     cls: 'bg-[#fff3d6] text-[#946200]' },
  paid:      { label: '결제완료', cls: 'bg-[#e6f6ec] text-[#15803d]' },
  cancelled: { label: '취소',     cls: 'bg-zinc-200 text-zinc-600' },
  refunded:  { label: '환불',     cls: 'bg-zinc-200 text-zinc-600' },
  failed:    { label: '실패',     cls: 'bg-red-50 text-red-700' },
}

type Tab = 'pg' | 'iap'
type Store = 'app_store' | 'play_store'
const STORE_LABEL: Record<string, string> = { app_store: 'App Store', play_store: 'Play Store', unknown: '기타' }

interface IapRow {
  id: string
  createdAt: string
  userId: string
  userName: string | null
  store: string
  productId: string
  productLabel: string
  credits: number
  priceKrwApprox: number | null
  transactionId: string
}

function fmt(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AdminPaymentsPage() {
  const [items, setItems] = useState<PaymentRow[] | null>(null)
  const [confirm, setConfirm] = useState<PaymentRow | null>(null)
  const [mode, setMode] = useState<RefundMode>('normal')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('pg')
  const [iapItems, setIapItems] = useState<IapRow[] | null>(null)
  const [iapStore, setIapStore] = useState<Store>('app_store')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/payments')
    if (!res.ok) { setItems([]); return }
    const json = await res.json()
    setItems(json.data ?? [])
  }, [])

  const loadIap = useCallback(async () => {
    const res = await fetch('/api/admin/iap')
    if (!res.ok) { setIapItems([]); return }
    const json = await res.json()
    setIapItems(json.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'iap' && iapItems === null) loadIap() }, [tab, iapItems, loadIap])

  const iapFiltered = (iapItems ?? []).filter((r) => r.store === iapStore)

  function openCancel(p: PaymentRow) {
    setConfirm(p); setMode('normal'); setReason('')
  }

  async function handleSync(p: PaymentRow) {
    if (syncing) return
    setSyncing(p.paymentId)
    try {
      const res = await fetch(`/api/admin/payments/${p.paymentId}/sync`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '동기화 실패'); return }
      if (j.changed) { toast.success(`동기화됨 — ${j.status}${j.detail ? ` (${j.detail})` : ''}`); load() }
      else if (j.status === 'pg_unreachable') toast.error('PG 응답 없음 (env·키 확인)')
      else toast.success('변경 없음 (PG와 동일)')
    } finally {
      setSyncing(null)
    }
  }

  async function handleCancel() {
    if (!confirm || busy) return
    if (reason.trim().length < 5) { toast.error('취소 사유를 5자 이상 입력하세요'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/payments/${confirm.paymentId}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), mode }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          j.error === 'pg_cancel_failed' ? 'PG 취소 실패 (PortOne 상태 확인)'
          : j.error === 'nothing_refundable' ? '환불 가능한 미사용분이 없어요 (전부 사용됨). 회사 귀책이면 전액 모드로.'
          : (j.error ?? '실패'),
        )
        return
      }
      toast.success(`취소 완료 — ₩${(j.refundAmount ?? 0).toLocaleString()} 환불, ${j.revokeCredits ?? 0}크레딧 회수`)
      setConfirm(null)
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">결제</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {tab === 'pg'
            ? '웹 크레딧 구매(PortOne) 결제·지급·취소 내역. 문의 시 결제완료 건을 취소(환불)할 수 있어요.'
            : '앱 인앱결제(App Store/Play Store) 지급 내역 — 조회 전용. 결제·환불·정산은 각 스토어에서 처리됩니다.'}
        </p>
      </header>

      {/* 상위 탭 — PG(PortOne) / 인앱결제(IAP) */}
      <div className="flex items-center gap-1 border-b border-[#ebebeb]">
        {([['pg', 'PG 결제'], ['iap', '인앱결제']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3.5 py-2 text-sm font-medium -mb-px border-b-2 transition ${tab === k ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pg' && (
      <AdminPanel>
        {items === null ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-zinc-50 shimmer" />)}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-zinc-500 py-10 text-center">결제 내역이 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-[#ebebeb]">
                  <th className="py-2 pr-2 font-medium w-6"></th>
                  <th className="py-2 pr-3 font-medium">일시</th>
                  <th className="py-2 pr-3 font-medium">사용자</th>
                  <th className="py-2 pr-3 font-medium">상품</th>
                  <th className="py-2 pr-3 font-medium text-right">금액</th>
                  <th className="py-2 pr-3 font-medium text-right">크레딧</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 font-medium text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const st = STATUS[p.status] ?? { label: p.status, cls: 'bg-zinc-100 text-zinc-600' }
                  const isOpen = expanded === p.paymentId
                  return (
                    <Fragment key={p.paymentId}>
                    <tr className="border-b border-zinc-100">
                      <td className="py-2.5 pr-2">
                        <button
                          onClick={() => setExpanded(isOpen ? null : p.paymentId)}
                          aria-label="매칭 키"
                          className={`w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition ${isOpen ? 'rotate-90' : ''}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                        </button>
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-500 whitespace-nowrap">{fmt(p.createdAt)}</td>
                      <td className="py-2.5 pr-3 text-zinc-700 max-w-[120px] truncate">{p.userName ?? p.userId.slice(0, 8)}</td>
                      <td className="py-2.5 pr-3 text-zinc-700">{p.orderName}</td>
                      <td className="py-2.5 pr-3 text-zinc-900 text-right tabular-nums whitespace-nowrap">₩{p.amount.toLocaleString()}</td>
                      <td className="py-2.5 pr-3 text-zinc-700 text-right tabular-nums">
                        {p.credits.toLocaleString()}
                        {p.refundedCredits > 0 && <span className="text-red-500"> (-{p.refundedCredits.toLocaleString()})</span>}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                        {p.refundRequestedAt && p.status === 'paid' && (
                          <span className="ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#fff3d6] text-[#946200]">환불요청</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(p.status === 'paid' || p.status === 'ready') && (
                            <button
                              onClick={() => handleSync(p)}
                              disabled={syncing === p.paymentId}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 disabled:opacity-50"
                            >
                              {syncing === p.paymentId ? '동기화…' : 'PG 동기화'}
                            </button>
                          )}
                          {p.status === 'paid' && (
                            <button
                              onClick={() => openCancel(p)}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700"
                            >
                              취소·환불
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-zinc-100 bg-zinc-50/60">
                        <td />
                        <td colSpan={6} className="py-2.5 pr-3">
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                            <dt className="text-zinc-400">주문번호(oid)</dt>
                            <dd className="text-zinc-700 font-mono break-all select-all">{p.paymentId}</dd>
                            <dt className="text-zinc-400">PortOne 거래번호</dt>
                            <dd className="text-zinc-700 font-mono break-all select-all">{p.transactionId ?? '-'}</dd>
                            <dt className="text-zinc-400">PG(이니시스) TID</dt>
                            <dd className="text-zinc-700 font-mono break-all select-all">{p.pgTxId ?? '-'}</dd>
                            <dt className="text-zinc-400">카드 승인번호</dt>
                            <dd className="text-zinc-700 font-mono break-all select-all">{p.approvalNumber ?? '-'}</dd>
                            <dt className="text-zinc-400">영수증</dt>
                            <dd>
                              {p.receiptUrl
                                ? <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-[#0070f3] underline underline-offset-2">열기</a>
                                : <span className="text-zinc-400">-</span>}
                            </dd>
                            {p.refundRequestedAt && (
                              <>
                                <dt className="text-zinc-400">환불 신청</dt>
                                <dd className="text-zinc-700">{fmt(p.refundRequestedAt)} · {p.refundRequestReason ?? '-'}</dd>
                              </>
                            )}
                          </dl>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
      )}

      {tab === 'iap' && (
      <div className="space-y-3">
        {/* 스토어 하위 필터 — App Store / Play Store(현재 비어있음) */}
        <div className="flex items-center gap-1.5">
          {(['app_store', 'play_store'] as const).map((s) => {
            const on = iapStore === s
            const count = (iapItems ?? []).filter((r) => r.store === s).length
            return (
              <button
                key={s}
                onClick={() => setIapStore(s)}
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition ${on ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-[#ebebeb] hover:border-zinc-300'}`}
              >
                {STORE_LABEL[s]}{iapItems !== null && ` (${count})`}
              </button>
            )
          })}
        </div>

        <AdminPanel>
          {iapItems === null ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-zinc-50 shimmer" />)}</div>
          ) : iapFiltered.length === 0 ? (
            <p className="text-sm text-zinc-500 py-10 text-center">
              {iapStore === 'play_store' ? 'Play Store 인앱결제는 아직 없어요 (Android 결제 미가동).' : '인앱결제 내역이 없어요.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b border-[#ebebeb]">
                    <th className="py-2 pr-3 font-medium">일시</th>
                    <th className="py-2 pr-3 font-medium">사용자</th>
                    <th className="py-2 pr-3 font-medium">스토어</th>
                    <th className="py-2 pr-3 font-medium">상품</th>
                    <th className="py-2 pr-3 font-medium text-right">금액(참고)</th>
                    <th className="py-2 pr-3 font-medium text-right">크레딧</th>
                    <th className="py-2 font-medium">거래 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {iapFiltered.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100">
                      <td className="py-2.5 pr-3 text-zinc-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                      <td className="py-2.5 pr-3 text-zinc-700 max-w-[120px] truncate">{r.userName ?? r.userId.slice(0, 8)}</td>
                      <td className="py-2.5 pr-3 text-zinc-700 whitespace-nowrap">{STORE_LABEL[r.store] ?? r.store}</td>
                      <td className="py-2.5 pr-3 text-zinc-700">{r.productLabel}</td>
                      <td className="py-2.5 pr-3 text-zinc-500 text-right tabular-nums whitespace-nowrap">
                        {r.priceKrwApprox != null ? `≈ ₩${r.priceKrwApprox.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-700 text-right tabular-nums">{r.credits.toLocaleString()}</td>
                      <td className="py-2.5 text-zinc-500 font-mono text-[12px] max-w-[180px] truncate select-all" title={r.transactionId}>{r.transactionId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-zinc-400">금액은 국내 기준가 근사치(참고용)입니다. 실제 청구·수수료·정산·환불은 App Store Connect / Play Console에서 확인하세요.</p>
            </div>
          )}
        </AdminPanel>
      </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : () => setConfirm(null)} />
          <div className="relative bg-white border border-[#ebebeb] rounded-xl shadow-xl w-full max-w-[420px] p-5">
            <h2 className="text-base font-semibold text-zinc-900">결제 취소·환불</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {confirm.userName ?? confirm.userId.slice(0, 8)} · {confirm.orderName} (₩{confirm.amount.toLocaleString()} · {confirm.credits.toLocaleString()}cr)
            </p>

            {/* 환불 유형 */}
            <div className="mt-4 space-y-2">
              <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${mode === 'normal' ? 'border-[#0070f3] bg-[#f5f9ff]' : 'border-[#ebebeb]'}`}>
                <input type="radio" checked={mode === 'normal'} onChange={() => setMode('normal')} className="mt-0.5 accent-[#0070f3]" />
                <span>
                  <span className="block text-sm font-medium text-zinc-800">일반 환불 (미사용분 비례)</span>
                  <span className="block text-[12px] text-zinc-500 mt-0.5">사용한 크레딧은 환불 제외. 결제액 × 미사용 비율만 환불·회수.</span>
                </span>
              </label>
              <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer ${mode === 'company_fault' ? 'border-[#b3146b] bg-[#fdf2f8]' : 'border-[#ebebeb]'}`}>
                <input type="radio" checked={mode === 'company_fault'} onChange={() => setMode('company_fault')} className="mt-0.5 accent-[#b3146b]" />
                <span>
                  <span className="block text-sm font-medium text-zinc-800">회사 귀책·서비스 하자 (전액)</span>
                  <span className="block text-[12px] text-zinc-500 mt-0.5">오류·하자로 정상 이용 불가 시. 사용분 포함 전액 환불.</span>
                </span>
              </label>
            </div>

            {/* 사유 */}
            <div className="mt-3">
              <label className="text-xs text-zinc-500">취소 사유 (감사 로그, 5자 이상)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 고객 변심 환불 요청 / 생성 오류 보상"
                className="mt-1 w-full bg-zinc-50 border border-[#ebebeb] rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              />
            </div>

            <p className="mt-3 text-[11px] text-zinc-400">실제 환불액·회수 크레딧은 현재 보유 잔액 기준으로 서버가 계산합니다.</p>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={busy ? undefined : () => setConfirm(null)} disabled={busy} className="px-4 py-2 rounded-lg text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40">취소</button>
              <button onClick={handleCancel} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40">
                {busy ? '처리 중…' : '취소·환불 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
