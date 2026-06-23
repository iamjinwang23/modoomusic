// Design Ref: §5.2 Module 7 — 공지 수정/숨김/삭제
//   PATCH  /api/admin/announcements/[id]  → 제목·카테고리·본문·이미지·상태(숨김/공개) 수정
//   DELETE /api/admin/announcements/[id]  → 공지 삭제
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'
import { rowToAnnouncement, ANNOUNCEMENT_SELECT } from '@/services/announcement.service'

interface RouteParams { params: Promise<{ id: string }> }

const SELECT = ANNOUNCEMENT_SELECT
const CATEGORIES = ['notice', 'promotion', 'feature'] as const

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('announcements')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

  let body: {
    title?: unknown; category?: unknown; content?: unknown
    imageUrl?: unknown; status?: unknown; reason?: unknown; publishAt?: unknown
    popupEnabled?: unknown; popupStartsAt?: unknown; popupEndsAt?: unknown
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const toIso = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v) return null
    const t = new Date(v)
    return isNaN(t.getTime()) ? null : t.toISOString()
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  // 부분 업데이트 — 전달된 필드만 반영
  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string') {
    const t = body.title.trim()
    if (!t) return NextResponse.json({ error: 'title_required' }, { status: 400 })
    patch.title = t
  }
  if (typeof body.category === 'string' && CATEGORIES.includes(body.category as never)) {
    patch.category = body.category
  }
  if (typeof body.content === 'string') patch.content = body.content
  if (body.imageUrl === null || typeof body.imageUrl === 'string') {
    patch.image_url = body.imageUrl || null
  }
  if (body.status === 'published' || body.status === 'hidden') patch.status = body.status
  // 팝업: enabled가 boolean으로 오면 반영. 기간은 키가 있을 때만(null=해제, ISO=설정).
  if (typeof body.popupEnabled === 'boolean') patch.popup_enabled = body.popupEnabled
  if ('popupStartsAt' in body) patch.popup_starts_at = toIso(body.popupStartsAt)
  if ('popupEndsAt' in body) patch.popup_ends_at = toIso(body.popupEndsAt)
  // 예약 시각: null이면 즉시(예약 해제), 유효 ISO면 예약. 키 자체가 없으면 미변경.
  if (body.publishAt === null) {
    patch.publish_at = null
  } else if (typeof body.publishAt === 'string' && body.publishAt) {
    const t = new Date(body.publishAt)
    if (!isNaN(t.getTime())) patch.publish_at = t.toISOString()
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 팝업 활성화 시 다른 공지의 팝업 해제 (동시 1개 — 유니크 인덱스 보호)
  if (patch.popup_enabled === true) {
    await supabase.from('announcements').update({ popup_enabled: false }).eq('popup_enabled', true).neq('id', id)
  }

  let updated: Record<string, unknown> | null = null
  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'update_announcement',
        targetType: 'system',
        targetId: id,
        reason,
        payload: { fields: Object.keys(patch), status: patch.status },
      },
      async () => {
        const { data, error } = await supabase
          .from('announcements')
          .update(patch)
          .eq('id', id)
          .select(SELECT)
          .single()
        if (error) throw new Error(error.message)
        updated = data
      },
    )
  } catch (e) {
    if (e instanceof AuditError && e.code === 'reason_too_short') {
      return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
    }
    console.error('[announcements PATCH]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ data: rowToAnnouncement(updated as never) })
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('announcements')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

  let body: { reason?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })

  const supabase = createAdminClient()
  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'delete_announcement',
        targetType: 'system',
        targetId: id,
        reason,
      },
      async () => {
        const { error } = await supabase.from('announcements').delete().eq('id', id)
        if (error) throw new Error(error.message)
      },
    )
  } catch (e) {
    if (e instanceof AuditError && e.code === 'reason_too_short') {
      return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
    }
    console.error('[announcements DELETE]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { id } })
}
