// Design Ref: §4 — GET /api/admin/users/list?page=&limit=&sort=&dir=&filter=
// 전체 사용자 테이블 (페이지네이션 + 소팅 + 간단 필터)

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_SORT = new Set([
  'created_at', 'username', 'bonus_credits', 'song_count', 'follower_count',
])

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi('users')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
  const limit = [25, 50, 100].includes(parseInt(sp.get('limit') || '25', 10))
    ? parseInt(sp.get('limit') || '25', 10)
    : 25
  const sortRaw = sp.get('sort') || 'created_at'
  const sort = ALLOWED_SORT.has(sortRaw) ? sortRaw : 'created_at'
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc'
  // 필터: 'all' | 'suspended' | 'admin' | 'deleted'
  const filter = sp.get('filter') || 'all'

  const supabase = createAdminClient()

  const from = (page - 1) * limit
  const to = from + limit - 1

  let q = supabase
    .from('profiles')
    .select(
      'id, username, display_name, bonus_credits, is_admin, suspended_at, deleted_at, song_count, follower_count, created_at',
      { count: 'exact' },
    )
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to)

  if (filter === 'suspended') q = q.not('suspended_at', 'is', null)
  else if (filter === 'admin') q = q.eq('is_admin', true)
  else if (filter === 'deleted') q = q.not('deleted_at', 'is', null)

  const { data, error, count } = await q
  if (error) {
    console.error('[users.list]', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    bonusCredits: r.bonus_credits ?? 0,
    isAdmin: r.is_admin ?? false,
    suspendedAt: r.suspended_at,
    deletedAt: r.deleted_at ?? null,
    songCount: r.song_count ?? 0,
    followerCount: r.follower_count ?? 0,
    createdAt: r.created_at,
  }))

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total, totalPages },
  })
}
