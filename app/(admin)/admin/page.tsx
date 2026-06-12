// Design Ref: §5.2 Module 6 — 통계 대시보드. SSR.
// Neoxa 패턴 차용: shadow 카드 + 변화 지표 (vs 전 기간).

import Link from 'next/link'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = { title: '대시보드 — MONO Admin' }

interface CountQuery {
  count: number | null
  error: { message: string } | null
}

async function countFrom(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  gte?: string,
  lt?: string,
): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (gte) q = q.gte('created_at', gte)
  if (lt) q = q.lt('created_at', lt)
  const { count, error } = (await q) as CountQuery
  if (error) console.error(`[stats.${table}]`, error.message)
  return count ?? 0
}

async function fetchStats() {
  const supabase = createAdminClient()
  const now = new Date()
  const day = 24 * 60 * 60 * 1000

  const startOf = (d: Date) => {
    const x = new Date(d.getTime())
    x.setUTCHours(0, 0, 0, 0)
    return x
  }

  const todayStart = startOf(now)
  const yesterdayStart = new Date(todayStart.getTime() - day)
  const week = new Date(now.getTime() - 7 * day)
  const weekPrev = new Date(now.getTime() - 14 * day)
  const month = new Date(now.getTime() - 30 * day)
  const monthPrev = new Date(now.getTime() - 60 * day)

  const [
    totalUsers,
    signupsToday,    signupsYesterday,
    signupsWeek,     signupsWeekPrev,
    signupsMonth,    signupsMonthPrev,
    suspended, deleted,
    totalSongs,
    songsToday,      songsYesterday,
    songsWeek,       songsWeekPrev,
    pendingSongRep, pendingCommentRep,
    topSongs,
  ] = await Promise.all([
    countFrom(supabase, 'profiles'),
    countFrom(supabase, 'profiles', todayStart.toISOString()),
    countFrom(supabase, 'profiles', yesterdayStart.toISOString(), todayStart.toISOString()),
    countFrom(supabase, 'profiles', week.toISOString()),
    countFrom(supabase, 'profiles', weekPrev.toISOString(), week.toISOString()),
    countFrom(supabase, 'profiles', month.toISOString()),
    countFrom(supabase, 'profiles', monthPrev.toISOString(), month.toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('suspended_at', 'is', null).then((r) => r.count ?? 0),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null).then((r) => r.count ?? 0),
    countFrom(supabase, 'songs'),
    countFrom(supabase, 'songs', todayStart.toISOString()),
    countFrom(supabase, 'songs', yesterdayStart.toISOString(), todayStart.toISOString()),
    countFrom(supabase, 'songs', week.toISOString()),
    countFrom(supabase, 'songs', weekPrev.toISOString(), week.toISOString()),
    supabase.from('song_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null).then((r) => r.count ?? 0),
    supabase.from('comment_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null).then((r) => r.count ?? 0),
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
      total: totalUsers,
      today: signupsToday,       todayPrev: signupsYesterday,
      week: signupsWeek,         weekPrev: signupsWeekPrev,
      month: signupsMonth,       monthPrev: signupsMonthPrev,
      suspended, deleted,
    },
    songs: {
      total: totalSongs,
      today: songsToday,        todayPrev: songsYesterday,
      week: songsWeek,          weekPrev: songsWeekPrev,
    },
    reports: {
      pendingSongs: pendingSongRep,
      pendingComments: pendingCommentRep,
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

      {/* 사용자 */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 mb-3 px-1">사용자</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="총 사용자" value={stats.users.total} />
          <Stat label="오늘 가입" value={stats.users.today} prev={stats.users.todayPrev} period="어제 대비" accent="violet" />
          <Stat label="최근 7일 가입" value={stats.users.week} prev={stats.users.weekPrev} period="이전 7일 대비" />
          <Stat label="최근 30일 가입" value={stats.users.month} prev={stats.users.monthPrev} period="이전 30일 대비" />
          <Stat label="정지" value={stats.users.suspended} accent={stats.users.suspended > 0 ? 'red' : undefined} />
          <Stat label="탈퇴" value={stats.users.deleted} />
        </div>
      </section>

      {/* 곡 */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 mb-3 px-1">곡</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="총 곡 수" value={stats.songs.total} />
          <Stat label="오늘 생성" value={stats.songs.today} prev={stats.songs.todayPrev} period="어제 대비" accent="violet" />
          <Stat label="최근 7일" value={stats.songs.week} prev={stats.songs.weekPrev} period="이전 7일 대비" />
        </div>
      </section>

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

/**
 * 변화 지표 카드 — Neoxa 패턴.
 * value vs prev가 있으면 ↗ +N% 또는 ↘ -N% 표시.
 * accent: 강조 색 (violet/red).
 */
function Stat({
  label, value, prev, period, accent,
}: {
  label: string
  value: number
  prev?: number
  period?: string
  accent?: 'violet' | 'red'
}) {
  const valueColor = accent === 'violet' ? 'text-violet-700' : accent === 'red' ? 'text-red-700' : 'text-zinc-900'

  let delta: { sign: 'up' | 'down' | 'flat'; text: string } | null = null
  if (prev !== undefined && period) {
    if (prev === 0 && value === 0) {
      delta = { sign: 'flat', text: '변화 없음' }
    } else if (prev === 0) {
      delta = { sign: 'up', text: '신규' }
    } else {
      const pct = ((value - prev) / prev) * 100
      const sign = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'
      const arrow = sign === 'up' ? '↗' : sign === 'down' ? '↘' : '→'
      delta = { sign, text: `${arrow} ${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` }
    }
  }

  const deltaColor = delta?.sign === 'up' ? 'text-green-600' : delta?.sign === 'down' ? 'text-red-600' : 'text-zinc-400'

  return (
    <div className="bg-white border border-zinc-200 rounded-xl px-5 py-4">
      <p className="text-xs text-zinc-500 font-medium">{label}</p>
      <p className={`text-3xl font-semibold tabular-nums mt-2 leading-none ${valueColor}`}>
        {value.toLocaleString()}
      </p>
      {delta && period && (
        <p className="text-[11px] text-zinc-400 mt-2.5 flex items-center gap-1.5">
          <span className={`font-semibold ${deltaColor}`}>{delta.text}</span>
          <span>{period}</span>
        </p>
      )}
    </div>
  )
}
