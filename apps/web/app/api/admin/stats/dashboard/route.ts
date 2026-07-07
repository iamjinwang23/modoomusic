// Design Ref: §4 — GET /api/admin/stats/dashboard
// 핵심 운영 지표: 사용자·곡·크레딧·인기 Top 20

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = createAdminClient()

  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const today = new Date(now.getTime()); today.setUTCHours(0, 0, 0, 0)
  const week = new Date(now.getTime() - 7 * dayMs)
  const month = new Date(now.getTime() - 30 * dayMs)

  // 카운트들 (count: 'exact', head:true 로 빠르게)
  const [
    totalUsers, signupsToday, signupsWeek, signupsMonth,
    totalSongs, songsToday, songsWeek,
    activeSuspended, activeDeleted,
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
    supabase.from('songs')
      .select('id, title, user_id, play_count, like_count, comment_count, created_at')
      .eq('is_public', true)
      .order('play_count', { ascending: false })
      .limit(20),
  ])

  // 인기 곡 소유자 username 배치 조회
  const topRows = topSongs.data ?? []
  const ownerIds = new Set(topRows.map((s) => s.user_id))
  const { data: owners } = ownerIds.size > 0
    ? await supabase.from('profiles').select('id, username').in('id', Array.from(ownerIds))
    : { data: [] as { id: string; username: string }[] }
  const ownerMap = new Map((owners ?? []).map((u) => [u.id, u.username]))

  // 크레딧 통계
  const { data: creditAgg } = await supabase
    .from('profiles')
    .select('bonus_credits, daily_credits_used')
  const totalBonus = (creditAgg ?? []).reduce((s, r) => s + (r.bonus_credits ?? 0), 0)
  const totalDailyUsed = (creditAgg ?? []).reduce((s, r) => s + (r.daily_credits_used ?? 0), 0)

  // 신고 통계
  const [songReportsPending, commentReportsPending] = await Promise.all([
    supabase.from('song_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    supabase.from('comment_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
  ])

  return NextResponse.json({
    data: {
      users: {
        total: totalUsers.count ?? 0,
        signupsToday: signupsToday.count ?? 0,
        signupsWeek: signupsWeek.count ?? 0,
        signupsMonth: signupsMonth.count ?? 0,
        suspended: activeSuspended.count ?? 0,
        deleted: activeDeleted.count ?? 0,
      },
      songs: {
        total: totalSongs.count ?? 0,
        today: songsToday.count ?? 0,
        week: songsWeek.count ?? 0,
      },
      credits: {
        totalBonus,
        totalDailyUsed,
      },
      reports: {
        pendingSongs: songReportsPending.count ?? 0,
        pendingComments: commentReportsPending.count ?? 0,
      },
      topSongs: topRows.map((s) => ({
        id: s.id,
        title: s.title ?? '(제목 없음)',
        ownerUsername: ownerMap.get(s.user_id) ?? '(unknown)',
        playCount: s.play_count ?? 0,
        likeCount: s.like_count ?? 0,
        commentCount: s.comment_count ?? 0,
        createdAt: s.created_at,
      })),
    },
  })
}
