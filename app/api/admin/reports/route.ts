// Design Ref: §4.2 — GET /api/admin/reports?status=pending|resolved
// 곡·댓글 신고 통합 큐. status=pending이 기본(미처리).

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

interface SongReportRow {
  id: string
  reporter_id: string
  song_id: string
  reason: string
  created_at: string
  resolved_at: string | null
  resolution: string | null
  resolution_memo: string | null
  songs: {
    id: string
    title: string | null
    prompt: string | null
    user_id: string
    published: boolean
  } | null
  reporter: {
    username: string
    display_name: string | null
  } | null
}

interface CommentReportRow {
  id: string
  reporter_id: string
  comment_id: string
  reason: string
  created_at: string
  resolved_at: string | null
  resolution: string | null
  resolution_memo: string | null
  comments: {
    id: string
    content: string | null
    user_id: string
    song_id: string
  } | null
  reporter: {
    username: string
    display_name: string | null
  } | null
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  const isPending = status === 'pending'

  const supabase = createAdminClient()

  const songFilter = supabase
    .from('song_reports')
    .select(`
      id, reporter_id, song_id, reason, created_at, resolved_at, resolution, resolution_memo,
      songs:song_id ( id, title, prompt, user_id, published ),
      reporter:reporter_id ( username, display_name )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const commentFilter = supabase
    .from('comment_reports')
    .select(`
      id, reporter_id, comment_id, reason, created_at, resolved_at, resolution, resolution_memo,
      comments:comment_id ( id, content, user_id, song_id ),
      reporter:reporter_id ( username, display_name )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const [songRes, commentRes] = await Promise.all([
    isPending ? songFilter.is('resolved_at', null) : songFilter.not('resolved_at', 'is', null),
    isPending ? commentFilter.is('resolved_at', null) : commentFilter.not('resolved_at', 'is', null),
  ])

  if (songRes.error || commentRes.error) {
    console.error('[reports]', songRes.error?.message, commentRes.error?.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const songReports = (songRes.data as unknown as SongReportRow[]).map((r) => ({
    type: 'song' as const,
    id: r.id,
    targetId: r.song_id,
    targetTitle: r.songs?.title ?? '제목 없음',
    targetPreview: r.songs?.prompt ?? '',
    targetOwnerId: r.songs?.user_id ?? null,
    targetPublished: r.songs?.published ?? false,
    reporterUsername: r.reporter?.username ?? '',
    reason: r.reason,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    resolution: r.resolution,
    resolutionMemo: r.resolution_memo,
  }))

  const commentReports = (commentRes.data as unknown as CommentReportRow[]).map((r) => ({
    type: 'comment' as const,
    id: r.id,
    targetId: r.comment_id,
    targetTitle: r.comments?.content?.slice(0, 60) ?? '(삭제됨)',
    targetPreview: r.comments?.content ?? '',
    targetOwnerId: r.comments?.user_id ?? null,
    targetSongId: r.comments?.song_id ?? null,
    reporterUsername: r.reporter?.username ?? '',
    reason: r.reason,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    resolution: r.resolution,
    resolutionMemo: r.resolution_memo,
  }))

  const all = [...songReports, ...commentReports].sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1,
  )

  return NextResponse.json({ data: all })
}
