// Design Ref: §4 — GET /api/admin/content/songs?q=&page=&limit=&filter=
// 곡 검색 + 페이지네이션

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
  const limit = [25, 50, 100].includes(parseInt(sp.get('limit') || '25', 10))
    ? parseInt(sp.get('limit') || '25', 10)
    : 25
  const filter = sp.get('filter') || 'all'  // all | public | private

  const supabase = createAdminClient()
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('songs')
    .select('id, title, prompt, user_id, is_public, like_count, play_count, comment_count, created_at, model, status', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (q.length >= 2) {
    // title 또는 prompt 부분 일치
    query = query.or(`title.ilike.%${q}%,prompt.ilike.%${q}%`)
  }
  if (filter === 'public') query = query.eq('is_public', true)
  else if (filter === 'private') query = query.eq('is_public', false)

  const { data, error, count } = await query
  if (error) {
    console.error('[content.songs]', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // 사용자 username 배치 조회
  const userIds = new Set((data ?? []).map((s) => s.user_id))
  const { data: users } = userIds.size > 0
    ? await supabase.from('profiles').select('id, username').in('id', Array.from(userIds))
    : { data: [] as { id: string; username: string }[] }
  const userMap = new Map((users ?? []).map((u) => [u.id, u.username]))

  const rows = (data ?? []).map((s) => ({
    id: s.id,
    title: s.title ?? '(제목 없음)',
    prompt: s.prompt ?? '',
    ownerUsername: userMap.get(s.user_id) ?? '(unknown)',
    ownerId: s.user_id,
    isPublic: s.is_public,
    likeCount: s.like_count ?? 0,
    playCount: s.play_count ?? 0,
    commentCount: s.comment_count ?? 0,
    model: s.model,
    status: s.status,
    createdAt: s.created_at,
  }))

  const total = count ?? 0
  return NextResponse.json({
    data: rows,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  })
}
