// Design Ref: §5.2 Module 7 — 공지 "지금 전체 알림 보내기"
//   POST /api/admin/announcements/[id]/notify
//   이미 작성·공개된 공지를 전체(탈퇴 제외) 사용자에게 수동 발송.
//   예약 발행 자동 알림은 미지원(Hobby cron 한도) → 발행 시각 맞춰 어드민이 직접 클릭.
//   재발송 안전: 이미 받은 유저는 제외(app-level dedupe).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'
import { broadcastAnnouncementNotification } from '@/services/announcement.service'

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminApi('announcements')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

  const supabase = createAdminClient()
  const { data: ann, error } = await supabase
    .from('announcements')
    .select('id, title, content, status, publish_at')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[announcement notify] load:', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  if (!ann) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 공개 + 노출 가능(예약 시각 지남)한 공지만 발송. 숨김·미래 예약은 거부.
  const isVisible =
    ann.status === 'published' &&
    (!ann.publish_at || new Date(ann.publish_at as string).getTime() <= Date.now())
  if (!isVisible) return NextResponse.json({ error: 'not_published' }, { status: 409 })

  let sent = 0
  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'send_announcement',
        targetType: 'system',
        targetId: id,
        reason: `공지 전체 알림 발송: ${ann.title}`.slice(0, 200),
        payload: { title: ann.title },
      },
      async () => {
        const r = await broadcastAnnouncementNotification(supabase, {
          id: ann.id as string,
          title: ann.title as string,
          content: ann.content as string,
        })
        sent = r.sent
        await supabase.from('announcements').update({ notified_at: new Date().toISOString() }).eq('id', id)
      },
    )
  } catch (e) {
    if (e instanceof AuditError && e.code === 'reason_too_short') {
      return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
    }
    console.error('[announcement notify] send:', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ data: { id, sent } })
}
