'use client'

// Design Ref: §5.2 Module 5 — 곡 검색·관리 (강제 비공개·삭제)
// 댓글은 별도 검색 기능 없이 신고 처리 모듈에서 정리하는 방식.

import { useState, useEffect, useCallback } from 'react'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { AdminConfirm } from '@/components/admin/AdminConfirm'

interface SongRow {
  id: string
  title: string
  prompt: string
  ownerUsername: string
  ownerId: string
  isPublic: boolean
  likeCount: number
  playCount: number
  commentCount: number
  model: string | null
  status: string | null
  audioUrl: string | null
  coverImage: string | null
  coverHue: number | null
  createdAt: string
}

type ActionKind = { song: SongRow; kind: 'unpublish' | 'delete' } | null

export default function AdminContentPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<25 | 50 | 100>(25)
  const [rows, setRows] = useState<SongRow[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<ActionKind>(null)
  const [detail, setDetail] = useState<SongRow | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sp = new URLSearchParams({
      q: query.trim(),
      page: String(page),
      limit: String(limit),
      filter,
    })
    try {
      const res = await fetch(`/api/admin/content/songs?${sp.toString()}`)
      const data = await res.json()
      setRows(data.data ?? [])
      setPagination(data.pagination ?? { page: 1, limit, total: 0, totalPages: 1 })
    } finally { setLoading(false) }
  }, [query, page, limit, filter])

  // 검색은 디바운스, 그 외는 즉시
  useEffect(() => {
    const t = setTimeout(load, query.trim().length > 0 ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, query])

  async function handle(reason: string) {
    if (!action) return
    const url = action.kind === 'delete'
      ? `/api/admin/content/songs/${action.song.id}/delete`
      : `/api/admin/content/songs/${action.song.id}/unpublish`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message ?? data.error ?? '처리 실패')
    setFeedback({
      type: 'success',
      msg: action.kind === 'delete' ? '곡 삭제됨' : '곡 강제 비공개됨',
    })
    setAction(null)
    setDetail(null)
    load()
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">콘텐츠</h1>
        <p className="text-sm text-zinc-500 mt-1">곡 검색 + 강제 비공개·삭제. 댓글은 신고 처리 모듈에서 정리하세요.</p>
      </header>

      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.msg}
          <button onClick={() => setFeedback(null)} className="float-right text-zinc-400 hover:text-zinc-700">✕</button>
        </div>
      )}

      <AdminPanel
        title="곡 검색"
        description="제목 또는 프롬프트 부분 일치 (2자 이상)"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(1) }}
              className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
            >
              <option value="all">전체</option>
              <option value="public">공개</option>
              <option value="private">비공개</option>
            </select>
            <select
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value, 10) as 25 | 50 | 100); setPage(1) }}
              className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs"
            >
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n}곡</option>)}
            </select>
          </div>
        }
      >
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          placeholder="예: 사랑 (제목 또는 프롬프트)"
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <p className="text-xs text-zinc-500 mt-2">{loading ? '불러오는 중…' : `총 ${pagination.total.toLocaleString()}곡 · ${pagination.page}/${pagination.totalPages} 페이지`}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-200">
                <th className="text-left py-2 pr-3 font-medium">제목</th>
                <th className="text-left py-2 pr-3 font-medium">소유자</th>
                <th className="text-right py-2 pr-3 font-medium">재생</th>
                <th className="text-right py-2 pr-3 font-medium">좋아요</th>
                <th className="text-right py-2 pr-3 font-medium">댓글</th>
                <th className="text-left py-2 pr-3 font-medium">상태</th>
                <th className="text-left py-2 pr-3 font-medium">생성일</th>
                <th className="text-right py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2.5 pr-3 max-w-[260px]">
                    <p className="font-semibold text-zinc-900 truncate" title={s.title}>{s.title}</p>
                    {s.prompt && <p className="text-xs text-zinc-500 truncate" title={s.prompt}>{s.prompt}</p>}
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-900 truncate max-w-[120px]" title={s.ownerUsername}>{s.ownerUsername}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.playCount}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.likeCount}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.commentCount}</td>
                  <td className="py-2.5 pr-3">
                    {s.isPublic
                      ? <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">공개</span>
                      : <span className="text-[10px] font-medium bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded">비공개</span>}
                    {s.status === 'generating' && <span className="ml-1 text-[10px] font-medium bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">생성 중</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-zinc-600 whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString('ko-KR')}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <button
                      onClick={() => setDetail(s)}
                      className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-100 hover:bg-violet-200 text-violet-700"
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <p className="text-sm text-zinc-500 py-6 text-center">곡이 없어요</p>
          )}
        </div>

        {/* 페이지네이션 */}
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-600">
          <p className="tabular-nums">
            {pagination.total > 0
              ? `${((pagination.page - 1) * pagination.limit + 1).toLocaleString()}–${Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString()} / ${pagination.total.toLocaleString()}`
              : '0'}
          </p>
          <div className="flex items-center gap-1">
            <PageBtn onClick={() => setPage(1)} disabled={page === 1}>‹‹</PageBtn>
            <PageBtn onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>‹</PageBtn>
            <span className="px-3 py-1.5 tabular-nums">{pagination.page} / {pagination.totalPages}</span>
            <PageBtn onClick={() => setPage(Math.min(pagination.totalPages, page + 1))} disabled={page >= pagination.totalPages}>›</PageBtn>
            <PageBtn onClick={() => setPage(pagination.totalPages)} disabled={page >= pagination.totalPages}>››</PageBtn>
          </div>
        </div>
      </AdminPanel>

      {detail && (
        <SongDetailModal
          song={detail}
          onClose={() => setDetail(null)}
          onAction={(kind) => setAction({ song: detail, kind })}
        />
      )}

      <AdminConfirm
        open={!!action}
        title={action ? (action.kind === 'delete' ? `${action.song.title} 삭제` : `${action.song.title} 강제 비공개`) : ''}
        description={action
          ? action.kind === 'delete'
            ? '곡이 영구 삭제됩니다. 댓글·좋아요·신고도 함께 정리됩니다.'
            : '곡이 비공개로 전환됩니다. 본인은 라이브러리에서 그대로 볼 수 있어요.'
          : ''
        }
        confirmLabel={action?.kind === 'delete' ? '삭제' : '비공개로'}
        variant={action?.kind === 'delete' ? 'danger' : 'default'}
        onClose={() => setAction(null)}
        onConfirm={handle}
      />
    </div>
  )
}

function SongDetailModal({ song, onClose, onAction }: {
  song: SongRow
  onClose: () => void
  onAction: (kind: 'unpublish' | 'delete') => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white border border-zinc-200 rounded-2xl w-full max-w-[520px] max-h-[85vh] overflow-y-auto shadow-2xl">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-base font-semibold text-zinc-900">곡 상세</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500">✕</button>
        </header>

        <div className="p-6 space-y-4 text-sm">
          {/* 곡 카드 — 신고 상세와 동일 패턴 (커버 + 제목 + 프롬프트 + 오디오 플레이어) */}
          <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50">
            <div className="flex gap-3 p-3">
              <div
                className="w-20 h-20 rounded-lg shrink-0 overflow-hidden"
                style={!song.coverImage && song.coverHue != null ? {
                  background: `linear-gradient(135deg, hsl(${song.coverHue},65%,48%) 0%, hsl(${(song.coverHue + 55) % 360},55%,32%) 100%)`,
                } : undefined}
              >
                {song.coverImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={song.coverImage} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-zinc-900 truncate">{song.title}</p>
                {song.prompt && (
                  <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{song.prompt}</p>
                )}
                <a
                  href={`/song/${song.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-block mt-2 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
                >
                  곡 페이지 열기 ↗
                </a>
              </div>
            </div>
            {song.audioUrl && (
              <div className="border-t border-zinc-200 p-3 bg-white">
                <audio controls preload="none" src={song.audioUrl} className="w-full">
                  브라우저가 audio를 지원하지 않아요
                </audio>
              </div>
            )}
            {!song.audioUrl && (
              <p className="text-xs text-zinc-500 px-3 pb-3">오디오 없음 (생성 중이거나 삭제됨)</p>
            )}
          </div>

          <p className="text-xs text-zinc-500">소유자: <span className="text-zinc-900">{song.ownerUsername}</span> · {new Date(song.createdAt).toLocaleString('ko-KR')}</p>

          <Field label="상태" value={
            <>
              {song.isPublic
                ? <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">공개</span>
                : <span className="text-[10px] font-medium bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded">비공개</span>}
              {song.status === 'generating' && <span className="ml-1.5 text-[10px] font-medium bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">생성 중</span>}
              {song.model && <span className="ml-1.5 text-[10px] font-medium bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded">{song.model}</span>}
            </>
          } />

          <dl className="grid grid-cols-3 gap-3 bg-zinc-50 rounded-xl p-4">
            <div>
              <dt className="text-xs text-zinc-500">재생</dt>
              <dd className="text-base font-semibold text-zinc-900 tabular-nums">{song.playCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">좋아요</dt>
              <dd className="text-base font-semibold text-zinc-900 tabular-nums">{song.likeCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">댓글</dt>
              <dd className="text-base font-semibold text-zinc-900 tabular-nums">{song.commentCount}</dd>
            </div>
          </dl>

          <Field label="곡 ID" value={<span className="text-xs font-mono text-zinc-500 break-all">{song.id}</span>} />

          <div className="border-t border-zinc-100 pt-4">
            <p className="text-xs text-zinc-500 mb-2">관리자 액션</p>
            <div className="flex gap-2">
              {song.isPublic && (
                <button
                  onClick={() => onAction('unpublish')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900"
                >
                  강제 비공개
                </button>
              )}
              <button
                onClick={() => onAction('delete')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white"
              >
                강제 삭제
              </button>
            </div>
          </div>
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

function PageBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-8 h-8 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
    >
      {children}
    </button>
  )
}
