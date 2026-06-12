'use client'

// Design Ref: §5.2 — 사용자 검색 + 전체 목록 테이블 (정렬·페이지네이션)

import { useState, useEffect, useCallback } from 'react'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { AdminConfirm } from '@/components/admin/AdminConfirm'

interface UserRow {
  id: string
  username: string
  displayName: string | null
  email?: string | null  // search 결과에만 있음
  bonusCredits: number
  isAdmin: boolean
  suspendedAt: string | null
  deletedAt?: string | null
  songCount?: number
  followerCount?: number
  createdAt: string
}

interface ListResponse {
  data: UserRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

type SortKey = 'created_at' | 'username' | 'bonus_credits' | 'song_count' | 'follower_count'
type FilterKey = 'all' | 'suspended' | 'admin' | 'deleted'

const PAGE_SIZES = [25, 50, 100] as const

export default function AdminUsersPage() {
  // 검색
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserRow[]>([])
  const [searching, setSearching] = useState(false)

  // 상세 모달
  const [detailId, setDetailId] = useState<string | null>(null)

  // 전체 목록 (페이지네이션·정렬)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<25 | 50 | 100>(25)
  const [sort, setSort] = useState<SortKey>('created_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [list, setList] = useState<UserRow[]>([])
  const [pagination, setPagination] = useState<ListResponse['pagination']>({ page: 1, limit: 25, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(false)

  // 검색 디바운스
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSearchResults(data.data ?? [])
      } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // 전체 목록 fetch
  const loadList = useCallback(async () => {
    setLoading(true)
    const sp = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
      dir,
      filter,
    })
    try {
      const res = await fetch(`/api/admin/users/list?${sp.toString()}`)
      const data: ListResponse = await res.json()
      setList(data.data ?? [])
      setPagination(data.pagination)
    } finally { setLoading(false) }
  }, [page, limit, sort, dir, filter])

  useEffect(() => { loadList() }, [loadList])

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setDir(dir === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(key)
      setDir('desc')
    }
    setPage(1)
  }

  const isSearching = query.trim().length >= 2

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">사용자</h1>
        <p className="text-sm text-zinc-500 mt-1">검색 또는 전체 목록에서 사용자 클릭 → 상세에서 정지·강제 탈퇴 가능</p>
      </header>

      <AdminPanel title="사용자 검색" description="username 또는 email (2자 이상)">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: na5892 또는 user@example.com"
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors"
        />
        {isSearching && searching && <p className="text-xs text-zinc-500 mt-3">검색 중…</p>}
        {isSearching && !searching && searchResults.length === 0 && (
          <p className="text-xs text-zinc-500 mt-3">결과가 없어요</p>
        )}
        {isSearching && searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => setDetailId(u.id)}
                className="w-full flex items-center gap-3 bg-zinc-50 hover:bg-white hover:border-violet-300 border border-zinc-200 rounded-xl px-4 py-3 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">
                    {u.username}
                    {u.isAdmin && <Badge color="violet">admin</Badge>}
                    {u.suspendedAt && <Badge color="red">정지</Badge>}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{u.email ?? u.displayName ?? '—'}</p>
                </div>
                <div className="text-xs text-zinc-400 shrink-0">
                  {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                </div>
              </button>
            ))}
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="전체 사용자"
        description={loading ? '불러오는 중…' : `총 ${pagination.total}명 · ${pagination.page}/${pagination.totalPages} 페이지`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value as FilterKey); setPage(1) }}
              className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">전체</option>
              <option value="admin">관리자만</option>
              <option value="suspended">정지된 사용자</option>
              <option value="deleted">탈퇴된 사용자</option>
            </select>
            <select
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value, 10) as 25 | 50 | 100); setPage(1) }}
              className="bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}명</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-200">
                <ThSort label="username" sort={sort} dir={dir} k="username" onClick={toggleSort} />
                <ThSort label="가입일" sort={sort} dir={dir} k="created_at" onClick={toggleSort} />
                <ThSort label="보너스 cr" sort={sort} dir={dir} k="bonus_credits" onClick={toggleSort} align="right" />
                <ThSort label="곡 수" sort={sort} dir={dir} k="song_count" onClick={toggleSort} align="right" />
                <ThSort label="팔로워" sort={sort} dir={dir} k="follower_count" onClick={toggleSort} align="right" />
                <th className="text-left py-2 px-3 font-medium">상태</th>
                <th className="text-right py-2 px-3 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2.5 px-3">
                    <p className="font-semibold text-zinc-900">{u.username}</p>
                    {u.displayName && <p className="text-xs text-zinc-500">{u.displayName}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-zinc-600 tabular-nums whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{u.bonusCredits}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{u.songCount ?? 0}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{u.followerCount ?? 0}</td>
                  <td className="py-2.5 px-3">
                    {u.isAdmin && <Badge color="violet">admin</Badge>}
                    {u.suspendedAt && <Badge color="red">정지</Badge>}
                    {u.deletedAt && <Badge color="zinc">탈퇴</Badge>}
                    {!u.isAdmin && !u.suspendedAt && !u.deletedAt && <span className="text-xs text-zinc-400">정상</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => setDetailId(u.id)}
                      className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-100 hover:bg-violet-200 text-violet-700 transition-colors"
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && list.length === 0 && (
            <p className="text-sm text-zinc-500 py-6 text-center">사용자가 없어요</p>
          )}
        </div>

        {/* 페이지네이션 */}
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-600">
          <p className="tabular-nums">
            {((pagination.page - 1) * pagination.limit + 1).toLocaleString()}–
            {Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString()} / {pagination.total.toLocaleString()}
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

      {detailId && (
        <UserDetailModal
          userId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => { loadList() }}
        />
      )}
    </div>
  )
}

interface UserDetail {
  id: string
  username: string
  displayName: string | null
  bio: string | null
  email: string | null
  provider: string | null
  bonusCredits: number
  dailyCreditsUsed: number
  isAdmin: boolean
  suspendedAt: string | null
  suspendedReason: string | null
  deletedAt: string | null
  songCount: number
  followerCount: number
  followingCount: number
  createdAt: string
}

type ActionKind = 'suspend' | 'unsuspend' | 'force-delete' | null

function UserDetailModal({ userId, onClose, onChanged }: {
  userId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<ActionKind>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}`)
      const data = await res.json()
      setUser(data.data)
    } finally { setLoading(false) }
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handle(reason: string) {
    if (!action) return
    const url = action === 'force-delete'
      ? `/api/admin/users/${userId}/force-delete`
      : `/api/admin/users/${userId}/${action}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message ?? data.error ?? '처리 실패')

    onChanged()
    if (action === 'force-delete') {
      setFeedback({ type: 'success', msg: '강제 탈퇴 완료' })
      setAction(null)
      setTimeout(onClose, 800)
      return
    }
    setFeedback({
      type: 'success',
      msg: action === 'suspend' ? '정지 처리됨' : '정지 해제됨',
    })
    setAction(null)
    load()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white border border-zinc-200 rounded-2xl w-full max-w-[520px] max-h-[85vh] overflow-y-auto shadow-2xl">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-base font-semibold text-zinc-900">사용자 상세</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500">✕</button>
        </header>

        <div className="p-6 space-y-5 text-sm">
          {loading && <p className="text-zinc-500">불러오는 중…</p>}
          {!loading && !user && <p className="text-red-700">사용자를 찾을 수 없어요</p>}
          {user && (
            <>
              <div>
                <p className="text-base font-semibold text-zinc-900">
                  {user.username}
                  {user.isAdmin && <Badge color="violet">admin</Badge>}
                  {user.suspendedAt && <Badge color="red">정지</Badge>}
                  {user.deletedAt && <Badge color="zinc">탈퇴</Badge>}
                </p>
                <p className="text-xs text-zinc-500 mt-1">{user.email ?? '—'} · {user.provider ?? 'unknown'} · 가입 {new Date(user.createdAt).toLocaleDateString('ko-KR')}</p>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm bg-zinc-50 rounded-xl p-4">
                <Row label="display name" value={user.displayName ?? '—'} />
                <Row label="bio" value={user.bio ?? '—'} />
                <Row label="보너스 크레딧" value={`${user.bonusCredits}cr`} />
                <Row label="오늘 일일 사용" value={`${user.dailyCreditsUsed}cr`} />
                <Row label="곡 수" value={user.songCount} />
                <Row label="팔로워 / 팔로잉" value={`${user.followerCount} / ${user.followingCount}`} />
              </dl>

              {user.suspendedAt && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-4">
                  <p className="text-xs text-red-700">정지 시각: {new Date(user.suspendedAt).toLocaleString('ko-KR')}</p>
                  <p className="text-xs text-red-700 mt-1">사유: {user.suspendedReason ?? '—'}</p>
                </div>
              )}

              {feedback && (
                <div className={`rounded-xl px-3 py-2 text-xs ${
                  feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {feedback.msg}
                </div>
              )}

              <div>
                <p className="text-xs text-zinc-500 mb-2">관리자 액션</p>
                {user.isAdmin ? (
                  <p className="text-xs text-zinc-500">관리자 계정은 정지·강제 탈퇴할 수 없습니다.</p>
                ) : user.deletedAt ? (
                  <p className="text-xs text-zinc-500">이미 탈퇴 처리된 계정입니다.</p>
                ) : (
                  <div className="flex gap-2">
                    {user.suspendedAt ? (
                      <button
                        onClick={() => setAction('unsuspend')}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-200 hover:bg-zinc-300 text-zinc-700"
                      >
                        정지 해제
                      </button>
                    ) : (
                      <button
                        onClick={() => setAction('suspend')}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900"
                      >
                        정지
                      </button>
                    )}
                    <button
                      onClick={() => setAction('force-delete')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white"
                    >
                      강제 탈퇴
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {user && (
        <AdminConfirm
          open={!!action}
          title={
            action === 'suspend' ? `${user.username} 정지` :
            action === 'unsuspend' ? `${user.username} 정지 해제` :
            action === 'force-delete' ? `${user.username} 강제 탈퇴` : ''
          }
          description={
            action === 'force-delete'
              ? '계정 즉시 익명화 + 로그인 차단. 되돌릴 수 없습니다.'
              : action === 'suspend'
              ? '사용자는 정지된 상태가 됩니다 (현재는 표식만, 차단 로직은 추후 추가).'
              : '정지를 해제하고 정상 상태로 복구합니다.'
          }
          confirmLabel={
            action === 'force-delete' ? '강제 탈퇴' :
            action === 'suspend' ? '정지' : '정지 해제'
          }
          variant={action === 'force-delete' ? 'danger' : 'default'}
          onClose={() => setAction(null)}
          onConfirm={handle}
        />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-900 mt-0.5">{value}</dd>
    </div>
  )
}

function ThSort({ label, sort, dir, k, onClick, align = 'left' }: {
  label: string
  sort: SortKey
  dir: 'asc' | 'desc'
  k: SortKey
  onClick: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort === k
  return (
    <th className={`py-2 px-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 ${active ? 'text-violet-700' : 'text-zinc-500 hover:text-zinc-900'}`}
      >
        {label}
        <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
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

function Badge({ color, children }: { color: 'violet' | 'red' | 'zinc'; children: React.ReactNode }) {
  const cls = color === 'violet'
    ? 'bg-violet-100 text-violet-700'
    : color === 'red'
    ? 'bg-red-100 text-red-700'
    : 'bg-zinc-200 text-zinc-700'
  return <span className={`ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{children}</span>
}
