// Design Ref: §4.2 — POST /api/admin/grant-credit { userId, amount, reason }
// Plan SC: (1) SQL 없이 크레딧 지급 (2) 모든 동작 admin_actions 기록 (3) 사유 필수

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { withAudit, AuditError } from '@/services/admin.service'

const DAILY_LIMIT = parseInt(process.env.ADMIN_DAILY_GRANT_LIMIT_CR ?? '1000', 10)
const PER_REQUEST_LIMIT = 1000  // 단일 요청 최대 ±1000cr

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi('credits')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { userId?: unknown; amount?: unknown; reason?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId : ''
  const amount = typeof body.amount === 'number' && Number.isInteger(body.amount) ? body.amount : NaN
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (!userId || isNaN(amount) || amount === 0) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }
  if (Math.abs(amount) > PER_REQUEST_LIMIT) {
    return NextResponse.json({ error: 'invalid_input', message: `한 번에 ±${PER_REQUEST_LIMIT}cr 까지 지급 가능` }, { status: 400 })
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 일일 한도 체크 — admin_actions에서 오늘(UTC 기준) 지급 합계 조회
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { data: todayActions, error: todayErr } = await supabase
    .from('admin_actions')
    .select('payload')
    .eq('admin_id', auth.ctx.userId)
    .eq('action', 'grant_credit')
    .gte('created_at', todayStart.toISOString())
  if (todayErr) {
    console.error('[grant-credit] daily check:', todayErr.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  const todaySum = (todayActions ?? []).reduce((sum, row) => {
    const p = row.payload as { amount?: number } | null
    return sum + Math.abs(p?.amount ?? 0)
  }, 0)
  if (todaySum + Math.abs(amount) > DAILY_LIMIT) {
    return NextResponse.json({
      error: 'exceeds_daily_limit',
      message: `오늘 지급 한도(${DAILY_LIMIT}cr)를 초과했어요 (현재 ${todaySum}cr 사용)`,
    }, { status: 400 })
  }

  // 대상 사용자 조회
  const { data: target, error: targetErr } = await supabase
    .from('profiles')
    .select('id, username, bonus_credits')
    .eq('id', userId)
    .maybeSingle()
  if (targetErr) {
    console.error('[grant-credit] target:', targetErr.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  if (!target) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
  }

  const before = target.bonus_credits ?? 0
  const after = Math.max(0, before + amount)

  // mutation + 감사 로그 (withAudit 래퍼)
  try {
    await withAudit(
      {
        adminUserId: auth.ctx.userId,
        action: 'grant_credit',
        targetType: 'user',
        targetId: target.id,
        reason,
        payload: { amount, before: { bonusCredits: before }, after: { bonusCredits: after } },
      },
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ bonus_credits: after })
          .eq('id', target.id)
        if (error) throw new Error(error.message)
      },
    )
  } catch (e) {
    if (e instanceof AuditError && e.code === 'reason_too_short') {
      return NextResponse.json({ error: 'reason_too_short' }, { status: 400 })
    }
    console.error('[grant-credit] mutation:', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({
    data: { username: target.username, before, after, amount },
  })
}
