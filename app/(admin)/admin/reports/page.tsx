'use client'

// Design Ref: §5.2, §4.2 — 신고 큐 + 처리 (upheld/dismissed)
// 테이블 + 상세 모달 패턴 (사용자·감사 로그와 동일 톤)

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
  // song 전용
  targetAudioUrl?: string | null
  targetCoverImage?: string | null
  targetCoverHue?: number | null
  // comment 전용
  targetSongId?: string | null
  reporterUsername: string
  reason: string
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
  resolutionMemo: string | null
}

type ResolveAction = { report: Report; resolution: 'upheld' | 'dismissed' }

export default function AdminReportsPage() {
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending')
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<Report | null>(null)
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
    if (!res.ok) throw new Error(data.message ?? data.error ?? '처리 실패')

    setFeedback({
      type: 'success',
      msg: action.resolution === 'upheld'
        ? `${action.report.type === 'song' ? '곡' : '댓글'} 신고 인정 — 대상 조치 완료`
        : '신고 기각 처리됨',
    })
    setAction(null)
    setDetail(null)
    load()
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">신고</h1>
        <p className="text-sm text-zinc-500 mt-1">곡·댓글 신고 큐. 인정 시 자동 조치(곡: 비공개 / 댓글: 삭제)</p>
      </header>

      {feedback && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
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
            className={`px-4 py-2 rounded-full text-sm transition-colors ${
              tab === t ? 'bg-zinc-900 text-white' : 'bg-white border border-[#ebebeb] text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {t === 'pending' ? '미처리' : '처리 완료'}
          </button>
        ))}
      </div>

      <AdminPanel
        title={tab === 'pending' ? '미처리 신고' : '처리된 신고'}
        description={loading ? '불러오는 중…' : `${reports.length}건`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-[#ebebeb]">
                <th className="text-left py-2 pr-3 font-medium">시각</th>
                <th className="text-left py-2 pr-3 font-medium">유형</th>
                <th className="text-left py-2 pr-3 font-medium">신고자</th>
                <th className="text-left py-2 pr-3 font-medium">대상</th>
                <th className="text-left py-2 pr-3 font-medium">사유</th>
                <th className="text-left py-2 pr-3 font-medium">상태</th>
                <th className="text-right py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={`${r.type}-${r.id}`} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2.5 pr-3 text-xs text-zinc-700 tabular-nums whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('ko-KR')}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      r.type === 'song' ? 'bg-[#f3ebfb] text-[#4c2889]' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {r.type === 'song' ? '곡' : '댓글'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-900 truncate max-w-[120px]" title={r.reporterUsername}>
                    {r.reporterUsername}
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-900 truncate max-w-[260px]" title={r.targetTitle}>
                    {r.targetTitle}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-zinc-700 truncate max-w-[120px]" title={r.reason}>
                    {r.reason}
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.resolution === 'upheld' && (
                      <span className="text-[10px] font-medium bg-red-100 text-red-700 px-1.5 py-0.5 rounded">인정됨</span>
                    )}
                    {r.resolution === 'dismissed' && (
                      <span className="text-[10px] font-medium bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded">기각됨</span>
                    )}
                    {!r.resolution && (
                      <span className="text-[10px] font-medium bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">미처리</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <button
                      onClick={() => setDetail(r)}
                      className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#eef4ff] hover:bg-[#d3e5ff] text-[#0761d1] transition-colors"
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && reports.length === 0 && (
            <p className="text-sm text-zinc-500 py-6 text-center">신고가 없어요</p>
          )}
        </div>
      </AdminPanel>

      {detail && (
        <ReportDetailModal
          report={detail}
          onClose={() => setDetail(null)}
          onAction={(resolution) => setAction({ report: detail, resolution })}
        />
      )}

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

function ReportDetailModal({ report, onClose, onAction }: {
  report: Report
  onClose: () => void
  onAction: (resolution: 'upheld' | 'dismissed') => void
}) {
  const isPending = !report.resolvedAt

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white border border-[#ebebeb] rounded-lg w-full max-w-[560px] max-h-[85vh] overflow-y-auto shadow-xl">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 sticky top-0 bg-white rounded-t-lg">
          <h3 className="text-base font-semibold text-zinc-900">신고 상세</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500">✕</button>
        </header>

        <div className="p-6 space-y-4 text-sm">
          <Field label="신고 시각" value={new Date(report.createdAt).toLocaleString('ko-KR')} />
          <Field label="유형" value={
            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${
              report.type === 'song' ? 'bg-[#f3ebfb] text-[#4c2889]' : 'bg-blue-100 text-blue-700'
            }`}>
              {report.type === 'song' ? '곡' : '댓글'}
            </span>
          } />
          <Field label="신고자" value={report.reporterUsername} />
          <Field label="사유" value={<span className="font-medium">{report.reason}</span>} />
          {report.type === 'song' ? (
            <Field label="신고된 곡" value={
              <div className="border border-[#ebebeb] rounded-lg overflow-hidden bg-zinc-50">
                <div className="flex gap-3 p-3">
                  {/* 커버 */}
                  <div
                    className="w-20 h-20 rounded-lg shrink-0 overflow-hidden"
                    style={!report.targetCoverImage && report.targetCoverHue != null ? {
                      background: `linear-gradient(135deg, hsl(${report.targetCoverHue},65%,48%) 0%, hsl(${(report.targetCoverHue + 55) % 360},55%,32%) 100%)`,
                    } : undefined}
                  >
                    {report.targetCoverImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={report.targetCoverImage} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">{report.targetTitle}</p>
                    {report.targetPreview && (
                      <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{report.targetPreview}</p>
                    )}
                    <a
                      href={`/song/${report.targetId}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-block mt-2 text-[11px] font-semibold text-zinc-900 hover:text-zinc-900"
                    >
                      곡 페이지 열기 ↗
                    </a>
                  </div>
                </div>
                {/* 오디오 플레이어 */}
                {report.targetAudioUrl && (
                  <div className="border-t border-[#ebebeb] p-3 bg-white">
                    <audio
                      controls
                      preload="none"
                      src={report.targetAudioUrl}
                      className="w-full"
                    >
                      브라우저가 audio를 지원하지 않아요
                    </audio>
                  </div>
                )}
                {!report.targetAudioUrl && (
                  <p className="text-xs text-zinc-500 px-3 pb-3">오디오 없음 (생성 중이거나 삭제됨)</p>
                )}
              </div>
            } />
          ) : (
            <Field label="신고된 댓글" value={
              <div className="border border-[#ebebeb] rounded-lg overflow-hidden bg-zinc-50 p-3">
                <p className="text-sm text-zinc-900 whitespace-pre-wrap break-all leading-relaxed">{report.targetPreview || '(삭제됨)'}</p>
                {report.targetSongId && (
                  <a
                    href={`/song/${report.targetSongId}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-block mt-2 text-[11px] font-semibold text-zinc-900 hover:text-zinc-900"
                  >
                    댓글이 달린 곡 페이지 ↗
                  </a>
                )}
              </div>
            } />
          )}
          <Field label="대상 ID" value={<span className="text-xs font-mono text-zinc-500 break-all">{report.targetId}</span>} />

          {report.resolvedAt && (
            <div className="border-t border-zinc-100 pt-4 space-y-3">
              <Field label="처리 결과" value={
                <span className={`text-xs font-semibold ${report.resolution === 'upheld' ? 'text-red-700' : 'text-zinc-700'}`}>
                  {report.resolution === 'upheld' ? '인정됨 (대상 조치 완료)' : '기각됨'}
                </span>
              } />
              <Field label="처리 시각" value={new Date(report.resolvedAt).toLocaleString('ko-KR')} />
              {report.resolutionMemo && (
                <Field label="처리 메모" value={<p className="whitespace-pre-wrap">{report.resolutionMemo}</p>} />
              )}
            </div>
          )}

          {isPending && (
            <div className="border-t border-zinc-100 pt-4">
              <p className="text-xs text-zinc-500 mb-2">처리 결정</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onAction('upheld')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#ee0000] hover:bg-[#c50000] text-white"
                >
                  인정 + 조치
                </button>
                <button
                  onClick={() => onAction('dismissed')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
                >
                  기각
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">인정 시 곡은 비공개, 댓글은 삭제됩니다.</p>
            </div>
          )}
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
