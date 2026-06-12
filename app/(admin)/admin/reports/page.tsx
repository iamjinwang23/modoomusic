'use client'

// Design Ref: §5.2, §4.2 — 신고 큐 + 처리 (upheld/dismissed)
// Plan SC: (1) SQL 없이 신고 처리 (2) admin_actions 기록 (3) 사유 필수

import { useState, useEffect, useCallback } from 'react'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { AdminConfirm } from '@/components/admin/AdminConfirm'

interface Report {
  type: 'song' | 'comment'
  id: string
  targetId: string
  targetTitle: string
  targetPreview: string
  targetOwnerId: string | null
  reporterUsername: string
  reason: string
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
}

type ResolveAction = { report: Report; resolution: 'upheld' | 'dismissed' }

export default function AdminReportsPage() {
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending')
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<ResolveAction | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/reports?status=${tab}`)
      const data = await res.json()
      setReports(data.data ?? [])
    } catch (e) {
      console.error('[reports]', e)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  async function handleResolve(memo: string) {
    if (!action) return
    const res = await fetch(`/api/admin/reports/${action.report.type}/${action.report.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution: action.resolution, memo }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message ?? data.error ?? '처리 실패')
    }
    setFeedback({
      type: 'success',
      msg: action.resolution === 'upheld'
        ? `${action.report.type === 'song' ? '곡' : '댓글'} 신고 인정 — 대상 조치 완료`
        : '신고 기각 처리됨',
    })
    setAction(null)
    load()
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">신고 처리</h1>
        <p className="text-sm text-zinc-500 mt-1">곡·댓글 신고 큐. 인정 시 콘텐츠 자동 조치(곡: 비공개 / 댓글: 삭제)</p>
      </header>

      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.msg}
          <button onClick={() => setFeedback(null)} className="float-right text-zinc-400 hover:text-zinc-700">✕</button>
        </div>
      )}

      <div className="flex gap-2">
        {(['pending', 'resolved'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              tab === t ? 'bg-violet-600 text-white' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {t === 'pending' ? '미처리' : '처리 완료'}
          </button>
        ))}
      </div>

      <AdminPanel title={tab === 'pending' ? '미처리 신고' : '처리된 신고'} description={loading ? '불러오는 중…' : `${reports.length}건`}>
        {!loading && reports.length === 0 && (
          <p className="text-sm text-zinc-500">신고가 없어요</p>
        )}

        <div className="space-y-3">
          {reports.map((r) => (
            <div key={`${r.type}-${r.id}`} className="border border-zinc-200 rounded-xl p-4 bg-zinc-50">
              <div className="flex items-start gap-3">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${r.type === 'song' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                  {r.type === 'song' ? '곡' : '댓글'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{r.targetTitle}</p>
                  {r.targetPreview && (
                    <p className="text-xs text-zinc-600 mt-1 line-clamp-2 whitespace-pre-wrap">{r.targetPreview}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                    <span>신고자: <span className="text-zinc-700">{r.reporterUsername}</span></span>
                    <span>사유: <span className="text-zinc-700">{r.reason}</span></span>
                    <span>{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
                  </div>
                  {r.resolution && (
                    <p className="text-xs mt-2">
                      <span className={`font-semibold ${r.resolution === 'upheld' ? 'text-red-700' : 'text-zinc-600'}`}>
                        {r.resolution === 'upheld' ? '인정됨' : '기각됨'}
                      </span>
                      {r.resolvedAt && <span className="text-zinc-400 ml-2">{new Date(r.resolvedAt).toLocaleString('ko-KR')}</span>}
                    </p>
                  )}
                </div>
                {tab === 'pending' && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAction({ report: r, resolution: 'upheld' })}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
                    >
                      인정
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction({ report: r, resolution: 'dismissed' })}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-200 hover:bg-zinc-300 text-zinc-700 transition-colors"
                    >
                      기각
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminConfirm
        open={!!action}
        title={action
          ? action.resolution === 'upheld'
            ? `신고 인정 — ${action.report.type === 'song' ? '곡 강제 비공개' : '댓글 삭제'}`
            : '신고 기각'
          : ''
        }
        description={action
          ? action.resolution === 'upheld'
            ? '대상 콘텐츠가 자동으로 조치됩니다. 되돌릴 수 없습니다.'
            : '신고를 기각합니다. 대상 콘텐츠는 그대로 유지됩니다.'
          : ''
        }
        confirmLabel={action?.resolution === 'upheld' ? '인정 + 조치' : '기각'}
        variant={action?.resolution === 'upheld' ? 'danger' : 'default'}
        onClose={() => setAction(null)}
        onConfirm={handleResolve}
      />
    </div>
  )
}
