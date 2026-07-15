// 컬렉션 — 목록(GET, 없으면 기본 컬렉션 생성) + 생성(POST). 웹·앱 공용. RLS로 본인만.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import type { Collection } from '@mono/shared'

const SEL = 'id,name,cover_image,song_ids,created_at'
type Row = { id: string; name: string; cover_image: string | null; song_ids: string[] | null; created_at: string }
function toCollection(r: Row): Collection {
  return { id: r.id, name: r.name, coverImage: r.cover_image ?? undefined, songIds: r.song_ids ?? [], createdAt: r.created_at }
}

export async function GET() {
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data } = await client.from('collections').select(SEL).order('created_at', { ascending: true })
  let rows = (data ?? []) as Row[]
  // 기본 컬렉션 보장(웹 ensureDefault 파리티)
  if (rows.length === 0) {
    const { data: created } = await client.from('collections').insert({ user_id: user.id, name: '기본 컬렉션' }).select(SEL).single()
    if (created) rows = [created as Row]
  }
  return NextResponse.json({ collections: rows.map(toCollection) })
}

export async function POST(req: NextRequest) {
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { name?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })
  const { data, error } = await client.from('collections').insert({ user_id: user.id, name: name.slice(0, 60) }).select(SEL).single()
  if (error || !data) return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  return NextResponse.json({ collection: toCollection(data as Row) })
}
