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

interface PostReportRaw {
  id: string
  reporter_id: string
  post_id: string
  reason: string
  created_at: string
  resolved_at: string | null
  resolution: string | null
  resolution_memo: string | null
}

interface CommunityCommentReportRaw {
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
  const postQ = supabase
    .from('community_post_reports')
    .select('id, reporter_id, post_id, reason, created_at, resolved_at, resolution, resolution_memo')
    .order('created_at', { ascending: false })
    .limit(50)
  const ccommentQ = supabase
    .from('community_comment_reports')
    .select('id, reporter_id, comment_id, reason, created_at, resolved_at, resolution, resolution_memo')
    .order('created_at', { ascending: false })
    .limit(50)

  const [songRes, commentRes, postRes, ccommentRes] = await Promise.all([
    isPending ? songQ.is('resolved_at', null) : songQ.not('resolved_at', 'is', null),
    isPending ? commentQ.is('resolved_at', null) : commentQ.not('resolved_at', 'is', null),
    isPending ? postQ.is('resolved_at', null) : postQ.not('resolved_at', 'is', null),
    isPending ? ccommentQ.is('resolved_at', null) : ccommentQ.not('resolved_at', 'is', null),
  ])

  if (songRes.error || commentRes.error || postRes.error || ccommentRes.error) {
    console.error('[reports] song:', songRes.error?.message, 'comment:', commentRes.error?.message, 'post:', postRes.error?.message, 'ccomment:', ccommentRes.error?.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const songRows = (songRes.data ?? []) as SongReportRaw[]
  const commentRows = (commentRes.data ?? []) as CommentReportRaw[]
  const ccommentRows = (ccommentRes.data ?? []) as CommunityCommentReportRaw[]
  const postRows = (postRes.data ?? []) as PostReportRaw[]

  // 2) 참조 데이터 배치 조회
  const songIds = new Set(songRows.map((r) => r.song_id))
  const commentIds = new Set(commentRows.map((r) => r.comment_id))
  const postIds = new Set(postRows.map((r) => r.post_id))
  const ccommentIds = new Set(ccommentRows.map((r) => r.comment_id))
  const reporterIds = new Set([
    ...songRows.map((r) => r.reporter_id),
    ...commentRows.map((r) => r.reporter_id),
    ...postRows.map((r) => r.reporter_id),
    ...ccommentRows.map((r) => r.reporter_id),
  ])

  const [songsRes, commentsRes, postsRes, ccommentsRes, reportersRes] = await Promise.all([
    songIds.size > 0
      ? supabase.from('songs').select('id, title, prompt, user_id, is_public, audio_url, cover_image, cover_hue').in('id', Array.from(songIds))
      : Promise.resolve({ data: [], error: null }),
    commentIds.size > 0
      ? supabase.from('comments').select('id, content, user_id, song_id').in('id', Array.from(commentIds))
      : Promise.resolve({ data: [], error: null }),
    postIds.size > 0
      ? supabase.from('community_posts').select('id, content, author_id, community_id, status').in('id', Array.from(postIds))
      : Promise.resolve({ data: [], error: null }),
    ccommentIds.size > 0
      ? supabase.from('community_post_comments').select('id, body, user_id, post_id').in('id', Array.from(ccommentIds))
      : Promise.resolve({ data: [], error: null }),
    reporterIds.size > 0
      ? supabase.from('profiles').select('id, username, display_name').in('id', Array.from(reporterIds))
      : Promise.resolve({ data: [], error: null }),
  ])

  const songMap = new Map((songsRes.data ?? []).map((s) => [s.id, s]))
  const commentMap = new Map((commentsRes.data ?? []).map((c) => [c.id, c]))
  const postMap = new Map((postsRes.data ?? []).map((p) => [p.id, p]))
  const ccommentMap = new Map((ccommentsRes.data ?? []).map((c) => [c.id, c]))
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

  const postReports = postRows.map((r) => {
    const post = postMap.get(r.post_id) as { id: string; content: string | null; author_id: string; community_id: string; status: string } | undefined
    const reporter = reporterMap.get(r.reporter_id)
    return {
      type: 'community_post' as const,
      id: r.id,
      targetId: r.post_id,
      targetTitle: post?.content?.slice(0, 60) || '(내용 없음)',
      targetPreview: post?.content ?? '(삭제됨)',
      targetOwnerId: post?.author_id ?? null,
      targetCommunityId: post?.community_id ?? null,
      targetHidden: post?.status === 'hidden',
      reporterUsername: reporter?.username ?? '(unknown)',
      reason: r.reason,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolution: r.resolution,
      resolutionMemo: r.resolution_memo,
    }
  })

  const ccommentReports = ccommentRows.map((r) => {
    const comment = ccommentMap.get(r.comment_id) as { id: string; body: string | null; user_id: string; post_id: string } | undefined
    const reporter = reporterMap.get(r.reporter_id)
    return {
      type: 'community_comment' as const,
      id: r.id,
      targetId: r.comment_id,
      targetTitle: comment?.body?.slice(0, 60) ?? '(삭제됨)',
      targetPreview: comment?.body ?? '(삭제됨)',
      targetOwnerId: comment?.user_id ?? null,
      targetPostId: comment?.post_id ?? null,
      reporterUsername: reporter?.username ?? '(unknown)',
      reason: r.reason,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      resolution: r.resolution,
      resolutionMemo: r.resolution_memo,
    }
  })

  const all = [...songReports, ...commentReports, ...postReports, ...ccommentReports].sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1,
  )

  return NextResponse.json({ data: all })
}
