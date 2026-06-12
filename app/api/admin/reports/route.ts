// Design Ref: §4.2 — GET /api/admin/reports?status=pending|resolved
// 곡·댓글 신고 통합 큐. status=pending이 기본(미처리).
// embed join은 가끔 결과가 비어 나와서 분리 fetch + 배치 조회로 안정화.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

interface SongReportRaw {
  id: string
  reporter_id: string
  song_id: string
  reason: string
  created_at: string
  resolved_at: string | null
  resolution: string | null
  resolution_memo: string | null
}

interface CommentReportRaw {
  id: string
  reporter_id: string
  comment_id: string
  reason: string
  created_at: string
  resolved_at: string | null
  resolution: string | null
  resolution_memo: string | null
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi('reports')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  const isPending = status === 'pending'

  const supabase = createAdminClient()

  // 1) 신고 row 먼저 조회 (embed 없이)
  const songQ = supabase
    .from('song_reports')
    .select('id, reporter_id, song_id, reason, created_at, resolved_at, resolution, resolution_memo')
    .order('created_at', { ascending: false })
    .limit(50)
  const commentQ = supabase
    .from('comment_reports')
    .select('id, reporter_id, comment_id, reason, created_at, resolved_at, resolution, resolution_memo')
    .order('created_at', { ascending: false })
    .limit(50)

  const [songRes, commentRes] = await Promise.all([
    isPending ? songQ.is('resolved_at', null) : songQ.not('resolved_at', 'is', null),
    isPending ? commentQ.is('resolved_at', null) : commentQ.not('resolved_at', 'is', null),
  ])

  if (songRes.error || commentRes.error) {
    console.error('[reports] song:', songRes.error?.message, 'comment:', commentRes.error?.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const songRows = (songRes.data ?? []) as SongReportRaw[]
  const commentRows = (commentRes.data ?? []) as CommentReportRaw[]

  // 2) 참조 데이터 배치 조회
  const songIds = new Set(songRows.map((r) => r.song_id))
  const commentIds = new Set(commentRows.map((r) => r.comment_id))
  const reporterIds = new Set([
    ...songRows.map((r) => r.reporter_id),
    ...commentRows.map((r) => r.reporter_id),
  ])

  const [songsRes, commentsRes, reportersRes] = await Promise.all([
    songIds.size > 0
      ? supabase.from('songs').select('id, title, prompt, user_id, is_public, audio_url, cover_image, cover_hue').in('id', Array.from(songIds))
      : Promise.resolve({ data: [], error: null }),
    commentIds.size > 0
      ? supabase.from('comments').select('id, content, user_id, song_id').in('id', Array.from(commentIds))
      : Promise.resolve({ data: [], error: null }),
    reporterIds.size > 0
      ? supabase.from('profiles').select('id, username, display_name').in('id', Array.from(reporterIds))
      : Promise.resolve({ data: [], error: null }),
  ])

  const songMap = new Map((songsRes.data ?? []).map((s) => [s.id, s]))
  const commentMap = new Map((commentsRes.data ?? []).map((c) => [c.id, c]))
  const reporterMap = new Map((reportersRes.data ?? []).map((p) => [p.id, p]))

  // 3) 조합
  const songReports = songRows.map((r) => {
    const song = songMap.get(r.song_id) as { id: string; title: string | null; prompt: string | null; user_id: string; is_public: boolean; audio_url: string | null; cover_image: string | null; cover_hue: number | null } | undefined
    const reporter = reporterMap.get(r.reporter_id)
    return {
      type: 'song' as const,
      id: r.id,
      targetId: r.song_id,
      targetTitle: song?.title ?? '(삭제됨)',
      targetPreview: song?.prompt ?? '',
      targetOwnerId: song?.user_id ?? null,
      targetPublished: song?.is_public ?? false,
      targetAudioUrl: song?.audio_url ?? null,
      targetCoverImage: song?.cover_image ?? null,
      targetCoverHue: song?.cover_hue ?? null,
      reporterUsername: reporter?.username ?? '(unknown)',
      reason: r.reason,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolution: r.resolution,
      resolutionMemo: r.resolution_memo,
    }
  })

  const commentReports = commentRows.map((r) => {
    const comment = commentMap.get(r.comment_id)
    const reporter = reporterMap.get(r.reporter_id)
    return {
      type: 'comment' as const,
      id: r.id,
      targetId: r.comment_id,
      targetTitle: comment?.content?.slice(0, 60) ?? '(삭제됨)',
      targetPreview: comment?.content ?? '',
      targetOwnerId: comment?.user_id ?? null,
      targetSongId: comment?.song_id ?? null,
      reporterUsername: reporter?.username ?? '(unknown)',
      reason: r.reason,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolution: r.resolution,
      resolutionMemo: r.resolution_memo,
    }
  })

  const all = [...songReports, ...commentReports].sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1,
  )

  return NextResponse.json({ data: all })
}
