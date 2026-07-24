// 알림 카테고리별 푸시 on/off. GET=조회(기본 전부 ON), POST=단일 토글 upsert.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUSH_CATEGORIES, type PushCategory } from '@mono/shared'

function defaults(): Record<PushCategory, boolean> {
  return PUSH_CATEGORIES.reduce((a, c) => { a[c] = true; return a }, {} as Record<PushCategory, boolean>)
}

export async function GET() {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle()
  const prefs = defaults()
  if (data) for (const c of PUSH_CATEGORIES) prefs[c] = (data as Record<string, boolean>)[c] !== false
  // 전체 알림 마스터 — 행 없으면 기본 ON
  const pushEnabled = data ? (data as Record<string, boolean>).push_enabled !== false : true
  return NextResponse.json({ preferences: prefs, pushEnabled })
}

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { category?: unknown; enabled?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  const key = body.category as string
  // 개별 카테고리 + 전체 알림 마스터('push_enabled') 허용
  const validKeys: string[] = [...PUSH_CATEGORIES, 'push_enabled']
  if (!validKeys.includes(key) || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('notification_preferences')
    .upsert({ user_id: user.id, [key]: body.enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { console.error('[notif.prefs.post]', error.message); return NextResponse.json({ error: 'internal' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
