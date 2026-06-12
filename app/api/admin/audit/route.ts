// Design Ref: §4 — GET /api/admin/audit?admin&action&from&to&limit
// 감사 로그 조회. 필터: admin_id, action, 기간.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

interface ActionRow {
  id: string
  admin_id: string | null
  action: string
  target_type: string
  target_id: string | null
  payload: Record<string, unknown>
  reason: string
  created_at: string
  admin: { username: string | null } | null
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sp = req.nextUrl.searchParams
  const adminFilter = sp.get('admin') || ''
  const actionFilter = sp.get('action') || ''
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const limit = Math.min(parseInt(sp.get('limit') || '100', 10), 500)

  const supabase = createAdminClient()
  let q = supabase
    .from('admin_actions')
    .select(`
      id, admin_id, action, target_type, target_id, payload, reason, created_at,
      admin:admin_id ( username )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (adminFilter) q = q.eq('admin_id', adminFilter)
  if (actionFilter) q = q.eq('action', actionFilter)
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)

  const { data, error } = await q
  if (error) {
    console.error('[audit]', error.message)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const raw = (data as unknown as ActionRow[]) ?? []

  // target_id → 사람이 읽기 좋은 라벨로 해석 (배치 조회).
  // - user: profiles.username
  // - song: songs.title
  // - comment: comments.content (앞 40자)
  // - report: '신고 ' + 짧은 id
  const userIds = new Set<string>()
  const songIds = new Set<string>()
  const commentIds = new Set<string>()
  for (const r of raw) {
    if (!r.target_id) continue
    if (r.target_type === 'user') userIds.add(r.target_id)
    else if (r.target_type === 'song') songIds.add(r.target_id)
    else if (r.target_type === 'comment') commentIds.add(r.target_id)
  }

  const [userMap, songMap, commentMap] = await Promise.all([
    (async () => {
      if (userIds.size === 0) return new Map<string, string>()
      const { data } = await supabase
        .from('profiles')
        .select('id, username, deleted_at')
        .in('id', Array.from(userIds))
      const m = new Map<string, string>()
      for (const u of data ?? []) m.set(u.id, u.deleted_at ? `${u.username} (탈퇴)` : u.username)
      return m
    })(),
    (async () => {
      if (songIds.size === 0) return new Map<string, string>()
      const { data } = await supabase
        .from('songs')
        .select('id, title')
        .in('id', Array.from(songIds))
      const m = new Map<string, string>()
      for (const s of data ?? []) m.set(s.id, s.title ?? '(제목 없음)')
      return m
    })(),
    (async () => {
      if (commentIds.size === 0) return new Map<string, string>()
      const { data } = await supabase
        .from('comments')
        .select('id, content')
        .in('id', Array.from(commentIds))
      const m = new Map<string, string>()
      for (const c of data ?? []) {
        const t = (c.content ?? '').slice(0, 40)
        m.set(c.id, t || '(빈 댓글)')
      }
      return m
    })(),
  ])

  function resolveLabel(targetType: string, targetId: string | null, payload: Record<string, unknown>): string {
    if (!targetId) return ''
    if (targetType === 'user') return userMap.get(targetId) ?? '(삭제됨)'
    if (targetType === 'song') return songMap.get(targetId) ?? '(삭제됨)'
    if (targetType === 'comment') return commentMap.get(targetId) ?? '(삭제됨)'
    if (targetType === 'report') {
      const t = payload?.reportType === 'comment' ? '댓글 신고' : '곡 신고'
      return `${t} ${targetId.slice(0, 8)}`
    }
    return targetId.slice(0, 8)
  }

  const rows = raw.map((r) => ({
    id: r.id,
    adminUsername: r.admin?.username ?? '(deleted)',
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    targetLabel: resolveLabel(r.target_type, r.target_id, r.payload),
    payload: r.payload,
    reason: r.reason,
    createdAt: r.created_at,
  }))

  return NextResponse.json({ data: rows })
}
