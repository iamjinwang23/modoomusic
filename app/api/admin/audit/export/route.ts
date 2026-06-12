// Design Ref: §4 — GET /api/admin/audit/export?from&to → CSV 다운로드

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'

interface ActionRow {
  id: string
  action: string
  target_type: string
  target_id: string | null
  payload: Record<string, unknown>
  reason: string
  created_at: string
  admin: { username: string | null } | null
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sp = req.nextUrl.searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const action = sp.get('action') || ''

  const supabase = createAdminClient()
  let q = supabase
    .from('admin_actions')
    .select(`id, action, target_type, target_id, payload, reason, created_at, admin:admin_id ( username )`)
    .order('created_at', { ascending: false })
    .limit(10000)
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)
  if (action) q = q.eq('action', action)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'internal' }, { status: 500 })

  const rows = data as unknown as ActionRow[]
  const header = ['created_at', 'admin', 'action', 'target_type', 'target_id', 'reason', 'payload']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      r.created_at,
      r.admin?.username ?? '',
      r.action,
      r.target_type,
      r.target_id ?? '',
      r.reason,
      r.payload,
    ].map(csvEscape).join(','))
  }

  const csv = '﻿' + lines.join('\n')  // UTF-8 BOM (엑셀 한글 호환)
  const ts = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="admin-actions-${ts}.csv"`,
    },
  })
}
