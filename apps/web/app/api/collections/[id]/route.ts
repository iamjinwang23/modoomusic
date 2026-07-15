// 컬렉션 — 이름변경(PATCH) + 삭제(DELETE). RLS로 본인 소유만 영향.
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import type { Collection } from '@mono/shared'

interface Params { id: string }
const SEL = 'id,name,cover_image,song_ids,created_at'
type Row = { id: string; name: string; cover_image: string | null; song_ids: string[] | null; created_at: string }
const toCollection = (r: Row): Collection => ({ id: r.id, name: r.name, coverImage: r.cover_image ?? undefined, songIds: r.song_ids ?? [], createdAt: r.created_at })

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { name?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })
  const { data, error } = await client.from('collections')
    .update({ name: name.slice(0, 60), updated_at: new Date().toISOString() })
    .eq('id', id).select(SEL).single()
  if (error || !data) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  return NextResponse.json({ collection: toCollection(data as Row) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await client.from('collections').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
