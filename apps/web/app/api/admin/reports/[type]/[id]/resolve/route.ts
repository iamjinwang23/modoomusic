// Design Ref: §4.2 — POST /api/admin/reports/[type]/[id]/resolve { resolution, memo }
// upheld: songs.is_public=false 또는 comment DELETE / dismissed: 상태만 기록

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'

interface RouteParams {
  params: Promise<{ type: string; id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('reports')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { type, id } = await params
  if (type !== 'song' && type !== 'comment' && type !== 'community_post') {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  let body: { resolution?: unknown; memo?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const resolution = body.resolution === 'upheld' || body.resolution === 'dismissed' ? body.resolution : null
  const memo = typeof body.memo === 'string' ? body.memo.trim() : ''

  if (!resolution) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  if (memo.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  const supabase = createAdminClient()
  const reportTable = type === 'song' ? 'song_reports' : type === 'comment' ? 'comment_reports' : 'community_post_reports'
  const targetField = type === 'song' ? 'song_id' : type === 'comment' ? 'comment_id' : 'post_id'

  // 신고 row 조회
  const { data: report, error: reportErr } = await supabase
    .from(reportTable)
    .select(`id, ${targetField}, resolved_at`)
    .eq('id', id)
    .maybeSingle()
  if (reportErr) {
    console.error('[reports/resolve] fetch:', reportErr.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  if (!report) return NextResponse.json({ error: 'target_not_found' }, { status: 404 })
  if (report.resolved_at) return NextResponse.json({ error: 'already_resolved' }, { status: 400 })

  const targetId = (report as Record<string, string>)[targetField]

  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'resolve_report',
        targetType: 'report',
        targetId: id,
        reason: memo,
        payload: { reportType: type, targetId, resolution },
      },
      async () => {
        // 1) 신고 row 상태 업데이트
        const { error: updErr } = await supabase
          .from(reportTable)
          .update({
            resolved_at: new Date().toISOString(),
            resolution,
            resolution_memo: memo,
            resolved_by: auth.ctx.userId,
          })
          .eq('id', id)
        if (updErr) throw new Error(updErr.message)

        // 2) upheld 시 대상 콘텐츠 조치
        if (resolution === 'upheld') {
          if (type === 'song') {
            const { error } = await supabase
              .from('songs')
              .update({ is_public: false })
              .eq('id', targetId)
            if (error) throw new Error(`song unpublish: ${error.message}`)
          } else if (type === 'comment') {
            const { error } = await supabase
              .from('comments')
              .delete()
              .eq('id', targetId)
            if (error) throw new Error(`comment delete: ${error.message}`)
          } else {
            // community_post — 블라인드(status=hidden)
            const { error } = await supabase
              .from('community_posts')
              .update({ status: 'hidden' })
              .eq('id', targetId)
            if (error) throw new Error(`post hide: ${error.message}`)
          }
        }
      },
    )
  } catch (e) {
    if (e instanceof AuditError && e.code === 'reason_too_short') {
      return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
    }
    console.error('[reports/resolve]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { resolved: true, resolution } })
}
