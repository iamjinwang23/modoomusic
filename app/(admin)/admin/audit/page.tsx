'use client'

// Design Ref: §5.2 — 감사 로그 조회 + 필터 + CSV 다운로드

import { useState, useEffect, useCallback } from 'react'
import { AdminPanel } from '@/components/admin/AdminPanel'

interface AuditRow {
  id: string
  adminUsername: string
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string
  payload: Record<string, unknown>
  reason: string
  createdAt: string
}

const ACTION_KO: Record<string, string> = {
  grant_credit:      '크레딧 지급',
  resolve_report:    '신고 처리',
  suspend_user:      '사용자 정지',
  unsuspend_user:    '정지 해제',
  force_delete_user: '강제 탈퇴',
  unpublish_song:    '곡 강제 비공개',
  delete_song:       '곡 삭제',
  send_announcement: '공지 송출',
  update_model:      '모델 변경',
}

/**
 * payload를 동작별로 사람이 읽기 좋은 한 줄로 요약.
 * 원본 JSON은 hover(title)로 확인 가능.
 */
function summarizePayload(action: string, payload: Record<string, unknown>): string {
  try {
    switch (action) {
      case 'grant_credit': {
        const amount = payload.amount as number ?? 0
        const before = (payload.before as { bonusCredits?: number } | undefined)?.bonusCredits ?? 0
        const after = (payload.after as { bonusCredits?: number } | undefined)?.bonusCredits ?? 0
        const sign = amount >= 0 ? '+' : ''
        return `${before}cr → ${after}cr (${sign}${amount})`
      }
      case 'resolve_report': {
        const t = payload.reportType === 'song' ? '곡' : '댓글'
        const r = payload.resolution === 'upheld' ? '인정' : '기각'
        return `${t} 신고 ${r}`
      }
      case 'suspend_user': {
        const u = payload.username as string ?? ''
        return u ? `${u} 정지` : '정지'
      }
      case 'unsuspend_user': {
        const u = payload.username as string ?? ''
        return u ? `${u} 정지 해제` : '정지 해제'
      }
      case 'force_delete_user': {
        const u = payload.username as string ?? ''
        return u ? `${u} 강제 탈퇴` : '강제 탈퇴'
      }
      case 'unpublish_song':
        return '게시 취소'
      case 'delete_song':
        return '삭제'
      case 'send_announcement': {
        const title = payload.title as string ?? ''
        const target = payload.target as string ?? ''
        return target ? `${target} 대상: "${title}"` : `"${title}"`
      }
      case 'update_model': {
        const id = payload.modelId as string ?? ''
        return id ? `${id} 변경` : '변경'
      }
      default:
        return ''
    }
  } catch {
    return ''
  }
}

const ACTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '전체' },
  ...Object.entries(ACTION_KO).map(([value, ko]) => ({
    value,
    label: `${ko} [${value}]`,
  })),
]

const TARGET_TYPE_KO: Record<string, string> = {
  user: '사용자',
  song: '곡',
  comment: '댓글',
  report: '신고',
  system: '시스템',
}

export default function AdminAuditPage() {
  const [action, setAction] = useState<string>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<AuditRow | null>(null)

  // date 입력은 'YYYY-MM-DD'. from은 그 날 00:00:00, to는 그 날 23:59:59.999 (로컬 기준).
  function buildParams(extra?: Record<string, string>): URLSearchParams {
    const sp = new URLSearchParams(extra)
    if (action) sp.set('action', action)
    if (from) sp.set('from', new Date(`${from}T00:00:00`).toISOString())
    if (to) sp.set('to', new Date(`${to}T23:59:59.999`).toISOString())
    return sp
  }

  const load = useCallback(async () => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (action) sp.set('action', action)
    if (from) sp.set('from', new Date(`${from}T00:00:00`).toISOString())
    if (to) sp.set('to', new Date(`${to}T23:59:59.999`).toISOString())
    sp.set('limit', '200')
    try {
      const res = await fetch(`/api/admin/audit?${sp.toString()}`)
      const data = await res.json()
      setRows(data.data ?? [])
    } finally { setLoading(false) }
  }, [action, from, to])

  useEffect(() => { load() }, [load])

  function exportCsv() {
    const sp = buildParams()
    window.open(`/api/admin/audit/export?${sp.toString()}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">감사 로그</h1>
        <p className="text-sm text-zinc-500 mt-1">모든 어드민 동작 기록. 필터 후 CSV로 내보낼 수 있어요.</p>
      </header>

      <AdminPanel
        title="필터"
        actions={
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white"
          >
            CSV 내보내기
          </button>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-zinc-500">동작</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">시작</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">끝</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </AdminPanel>

      <AdminPanel title={`기록 ${rows.length}건`} description={loading ? '불러오는 중…' : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-200">
                <th className="text-left py-2 pr-3 font-medium">시각</th>
                <th className="text-left py-2 pr-3 font-medium">어드민</th>
                <th className="text-left py-2 pr-3 font-medium">동작</th>
                <th className="text-left py-2 pr-3 font-medium">대상</th>
                <th className="text-left py-2 pr-3 font-medium">요약</th>
                <th className="text-right py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 pr-3 text-xs text-zinc-700 tabular-nums whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('ko-KR')}
                  </td>
                  <td className="py-2 pr-3 text-zinc-900">{r.adminUsername}</td>
                  <td className="py-2 pr-3">
                    <span
                      className="text-[10px] font-medium bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded"
                      title={r.action}
                    >
                      {ACTION_KO[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-zinc-700 max-w-[200px] truncate" title={r.targetLabel || r.targetId || ''}>
                    {r.targetLabel ? (
                      <>
                        <span className="text-zinc-400 mr-1">{TARGET_TYPE_KO[r.targetType] ?? r.targetType}</span>
                        <span className="text-zinc-900">{r.targetLabel}</span>
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-zinc-700 max-w-[280px] truncate">
                    {summarizePayload(r.action, r.payload) || <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      onClick={() => setDetail(r)}
                      className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-100 hover:bg-violet-200 text-violet-700 transition-colors"
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <p className="text-sm text-zinc-500 py-6 text-center">기록이 없어요</p>
          )}
        </div>
      </AdminPanel>

      {detail && <AuditDetailModal row={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function AuditDetailModal({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white border border-zinc-200 rounded-2xl w-full max-w-[560px] max-h-[85vh] overflow-y-auto shadow-2xl">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-base font-semibold text-zinc-900">감사 로그 상세</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500">✕</button>
        </header>

        <div className="p-6 space-y-4 text-sm">
          <Field label="시각" value={new Date(row.createdAt).toLocaleString('ko-KR')} />
          <Field label="어드민" value={row.adminUsername} />
          <Field label="동작" value={
            <>
              <span className="text-zinc-900">{ACTION_KO[row.action] ?? row.action}</span>
              <span className="ml-2 text-xs text-zinc-400 font-mono">{row.action}</span>
            </>
          } />
          <Field label="대상" value={
            row.targetId ? (
              <div className="space-y-1">
                <p>
                  <span className="text-zinc-400 mr-1">{TARGET_TYPE_KO[row.targetType] ?? row.targetType}</span>
                  <span className="text-zinc-900 font-medium">{row.targetLabel || '(라벨 없음)'}</span>
                </p>
                <p className="text-xs font-mono text-zinc-500 break-all">{row.targetId}</p>
              </div>
            ) : <span className="text-zinc-400">—</span>
          } />
          <Field label="요약" value={summarizePayload(row.action, row.payload) || <span className="text-zinc-400">—</span>} />
          <Field label="사유" value={<p className="whitespace-pre-wrap leading-relaxed">{row.reason}</p>} />
          <Field label="payload (raw)" value={
            <pre className="text-[11px] bg-zinc-50 border border-zinc-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(row.payload, null, 2)}
            </pre>
          } />
          <Field label="로그 ID" value={<span className="text-xs font-mono text-zinc-500 break-all">{row.id}</span>} />
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-900">{value}</dd>
    </div>
  )
}
