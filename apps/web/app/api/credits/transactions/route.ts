// 크레딧 원장 조회 (mig 064). GET ?type=all|charge|usage & limit & offset (페이지네이션).
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PAGE = 30

export async function GET(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'all'   // all | charge | usage
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(PAGE), 10) || PAGE))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)

  const admin = createAdminClient()
  let q = admin
    .from('credit_transactions')
    .select('id, category, kind, amount, source, ref_id, title, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)   // limit+1 조회로 hasMore 판정
  if (type === 'charge' || type === 'usage') q = q.eq('category', type)

  const { data, error } = await q
  if (error) { console.error('[credits.tx]', error.message); return NextResponse.json({ error: 'internal' }, { status: 500 }) }

  const rows = data ?? []
  const hasMore = rows.length > limit
  const transactions = rows.slice(0, limit).map((r) => ({
    id: r.id,
    category: r.category,
    kind: r.kind,
    amount: r.amount,
    source: r.source,
    refId: r.ref_id,
    title: r.title,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ transactions, hasMore })
}
