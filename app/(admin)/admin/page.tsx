// Design Ref: §5.2 Module 6 — 통계 대시보드.
// 운영 핵심 지표를 카드로 한눈에, 인기 곡 Top 20 테이블.

import Link from 'next/link'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = { title: '대시보드 — MONO Admin' }

async function fetchStats() {
  const supabase = createAdminClient()
  const now = new Date()
  const day = 24 * 60 * 60 * 1000
  const today = new Date(now.getTime()); today.setUTCHours(0, 0, 0, 0)
  const week = new Date(now.getTime() - 7 * day)
  const month = new Date(now.getTime() - 30 * day)

  const [
    totalUsers, signupsToday, signupsWeek, signupsMonth,
    totalSongs, songsToday, songsWeek,
    suspendedRes, deletedRes,
    pendingSongRep, pendingCommentRep,
    topSongs,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', week.toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', month.toISOString()),
    supabase.from('songs').select('id', { count: 'exact', head: true }),
    supabase.from('songs').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    supabase.from('songs').select('id', { count: 'exact', head: true }).gte('created_at', week.toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('suspended_at', 'is', null),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
    supabase.from('song_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    supabase.from('comment_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    supabase.from('songs')
      .select('id, title, user_id, play_count, like_count, comment_count')
      .eq('is_public', true)
      .order('play_count', { ascending: false })
      .limit(20),
  ])

  const topRows = topSongs.data ?? []
  const ownerIds = new Set(topRows.map((s) => s.user_id))
  const { data: owners } = ownerIds.size > 0
    ? await supabase.from('profiles').select('id, username').in('id', Array.from(ownerIds))
    : { data: [] as { id: string; username: string }[] }
  const ownerMap = new Map((owners ?? []).map((u) => [u.id, u.username]))

  return {
    users: {
      total: totalUsers.count ?? 0,
      signupsToday: signupsToday.count ?? 0,
      signupsWeek: signupsWeek.count ?? 0,
      signupsMonth: signupsMonth.count ?? 0,
      suspended: suspendedRes.count ?? 0,
      deleted: deletedRes.count ?? 0,
    },
    songs: {
      total: totalSongs.count ?? 0,
      today: songsToday.count ?? 0,
      week: songsWeek.count ?? 0,
    },
    reports: {
      pendingSongs: pendingSongRep.count ?? 0,
      pendingComments: pendingCommentRep.count ?? 0,
    },
    topSongs: topRows.map((s) => ({
      id: s.id,
      title: s.title ?? '(제목 없음)',
      ownerUsername: ownerMap.get(s.user_id) ?? '(unknown)',
      playCount: s.play_count ?? 0,
      likeCount: s.like_count ?? 0,
      commentCount: s.comment_count ?? 0,
    })),
  }
}

export default async function AdminDashboardPage() {
  const stats = await fetchStats()
  const totalPendingReports = stats.reports.pendingSongs + stats.reports.pendingComments

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">대시보드</h1>
        <p className="text-sm text-zinc-500 mt-1">서비스 운영 핵심 지표 요약</p>
      </header>

      {/* 액션 필요 알림 */}
      {totalPendingReports > 0 && (
        <Link
          href="/admin/reports"
          className="block bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <p className="text-sm text-amber-900">
            <span className="font-semibold">미처리 신고 {totalPendingReports}건</span> — 곡 {stats.reports.pendingSongs} / 댓글 {stats.reports.pendingComments}. 클릭해서 처리하세요.
          </p>
        </Link>
      )}

      {/* 사용자 카드 */}
      <AdminPanel title="사용자">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="총 사용자" value={stats.users.total} />
          <Stat label="오늘 가입" value={stats.users.signupsToday} accent="violet" />
          <Stat label="최근 7일 가입" value={stats.users.signupsWeek} />
          <Stat label="최근 30일 가입" value={stats.users.signupsMonth} />
          <Stat label="정지" value={stats.users.suspended} accent={stats.users.suspended > 0 ? 'red' : undefined} />
          <Stat label="탈퇴" value={stats.users.deleted} />
        </div>
      </AdminPanel>

      {/* 곡 카드 */}
      <AdminPanel title="곡">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="총 곡 수" value={stats.songs.total} />
          <Stat label="오늘 생성" value={stats.songs.today} accent="violet" />
          <Stat label="최근 7일" value={stats.songs.week} />
        </div>
      </AdminPanel>

      {/* 인기 곡 Top 20 */}
      <AdminPanel title="인기 곡 Top 20" description="공개 곡 재생수 순">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-200">
                <th className="text-left py-2 pr-3 font-medium w-8">#</th>
                <th className="text-left py-2 pr-3 font-medium">제목</th>
                <th className="text-left py-2 pr-3 font-medium">소유자</th>
                <th className="text-right py-2 pr-3 font-medium">재생</th>
                <th className="text-right py-2 pr-3 font-medium">좋아요</th>
                <th className="text-right py-2 pr-3 font-medium">댓글</th>
                <th className="text-right py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {stats.topSongs.map((s, i) => (
                <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2.5 pr-3 text-xs text-zinc-500 tabular-nums">{i + 1}</td>
                  <td className="py-2.5 pr-3 text-zinc-900 truncate max-w-[300px]" title={s.title}>{s.title}</td>
                  <td className="py-2.5 pr-3 text-zinc-700">{s.ownerUsername}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">{s.playCount}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.likeCount}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s.commentCount}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <a
                      href={`/song/${s.id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-100 hover:bg-violet-200 text-violet-700 transition-colors"
                    >
                      보기
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.topSongs.length === 0 && (
            <p className="text-sm text-zinc-500 py-6 text-center">공개된 곡이 없어요</p>
          )}
        </div>
      </AdminPanel>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'violet' | 'red' }) {
  const valueColor = accent === 'violet' ? 'text-violet-700' : accent === 'red' ? 'text-red-700' : 'text-zinc-900'
  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${valueColor}`}>{value.toLocaleString()}</p>
    </div>
  )
}
