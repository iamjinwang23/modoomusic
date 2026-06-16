// Design Ref: §5.2 Module 7 — 공지 목록/작성
//   GET  /api/admin/announcements        → 전체 공지 (숨김 포함, 어드민)
//   POST /api/admin/announcements        → 공지 작성 (+옵션: 전체 알림 발송)
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'
import { rowToAnnouncement } from '@/services/announcement.service'

const SELECT = 'id, title, category, content, image_url, status, publish_at, created_at, updated_at'
const CATEGORIES = ['notice', 'promotion'] as const

export async function GET() {
  const auth = await requireAdminApi('announcements')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('announcements')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[announcements GET]', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  // rowToAnnouncement는 동일 컬럼 매핑 — 어드민도 동일 도메인 형태 사용
  return NextResponse.json({ data: (data ?? []).map((r) => rowToAnnouncement(r as never)) })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi('announcements')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: {
    id?: unknown; title?: unknown; category?: unknown; content?: unknown
    imageUrl?: unknown; status?: unknown; notify?: unknown; reason?: unknown; publishAt?: unknown
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const id = typeof body.id === 'string' && body.id ? body.id : undefined
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const category = typeof body.category === 'string' && CATEGORIES.includes(body.category as never)
    ? (body.category as 'notice' | 'promotion') : 'notice'
  const content = typeof body.content === 'string' ? body.content : ''
  const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl ? body.imageUrl : null
  const status = body.status === 'hidden' ? 'hidden' : 'published'
  const notify = body.notify === true

  // 예약 발행 시각 (ISO). 유효하지 않으면 null(즉시).
  let publishAt: string | null = null
  if (typeof body.publishAt === 'string' && body.publishAt) {
    const t = new Date(body.publishAt)
    if (!isNaN(t.getTime())) publishAt = t.toISOString()
  }
  const isScheduledFuture = publishAt !== null && new Date(publishAt).getTime() > Date.now()

  if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 })

  // 최초 작성은 사유 입력 생략 — 서버에서 감사 사유 자동 생성 (audit는 5자 이상 필요)
  const reason = (typeof body.reason === 'string' && body.reason.trim().length >= 5)
    ? body.reason.trim()
    : `공지 최초 작성: ${title}`.slice(0, 200)

  const supabase = createAdminClient()

  // 1) 공지 INSERT (id 클라이언트 생성 가능 — 본문 이미지 경로와 일치시키기 위함)
  const insertRow: Record<string, unknown> = {
    title, category, content, image_url: imageUrl, status, publish_at: publishAt, created_by: auth.ctx.userId,
  }
  if (id) insertRow.id = id

  const { data: created, error: insErr } = await supabase
    .from('announcements')
    .insert(insertRow)
    .select(SELECT)
    .single()
  if (insErr || !created) {
    console.error('[announcements POST] insert:', insErr?.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // 2) 감사 로그 + (옵션) 전체 알림 발송 — 즉시 발행(published, 예약 아님)일 때만 의미 있음
  // 예약 발행은 cron이 없어 발행 시점 알림을 보장할 수 없으므로 즉시발송 제외.
  const notified = notify && status === 'published' && !isScheduledFuture
  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'create_announcement',
        targetType: 'system',
        targetId: created.id,
        reason,
        payload: { title, category, status, notified, publishAt, scheduled: isScheduledFuture },
      },
      async () => {
        if (!notified) return
        // 탈퇴하지 않은 전체 사용자에게 system 알림. 클릭 시 공지 상세로 이동.
        const { data: users, error: uErr } = await supabase
          .from('profiles')
          .select('id')
          .is('deleted_at', null)
          .limit(100000)
        if (uErr) { console.error('[announcements notify] users:', uErr.message); return }
        const payload = {
          title,
          body: content.replace(/[#*`>_~\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80),
          url: `/announcements/${created.id}`,
        }
        const rows = (users ?? []).map((u) => ({
          user_id: u.id, type: 'system' as const, payload,
        }))
        // 배치 INSERT (대량 대비 1000개씩)
        for (let i = 0; i < rows.length; i += 1000) {
          const { error: nErr } = await supabase.from('notifications').insert(rows.slice(i, i + 1000))
          if (nErr) { console.error('[announcements notify] insert:', nErr.message); break }
        }
      },
    )
  } catch (e) {
    if (e instanceof AuditError && e.code === 'reason_too_short') {
      return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
    }
    console.error('[announcements POST] audit/notify:', e)
    // 공지는 이미 생성됨 — 알림 실패해도 공지 자체는 성공 처리
  }

  return NextResponse.json({ data: rowToAnnouncement(created as never), notified })
}
