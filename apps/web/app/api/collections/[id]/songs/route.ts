// 컬렉션 곡 추가(POST {songId}) / 제거(DELETE ?songId=). song_ids 배열을 읽고-수정-쓰기.
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'

interface Params { id: string }

export async function POST(req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { songId?: unknown }
  const songId = typeof body.songId === 'string' ? body.songId : ''
  if (!songId) return NextResponse.json({ error: 'songId_required' }, { status: 400 })
  const { data: col } = await client.from('collections').select('song_ids').eq('id', id).single()
  if (!col) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ids = (col.song_ids ?? []) as string[]
  if (!ids.includes(songId)) {
    await client.from('collections').update({ song_ids: [songId, ...ids], updated_at: new Date().toISOString() }).eq('id', id)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const songId = new URL(req.url).searchParams.get('songId') ?? ''
  if (!songId) return NextResponse.json({ error: 'songId_required' }, { status: 400 })
  const { data: col } = await client.from('collections').select('song_ids').eq('id', id).single()
  if (!col) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const ids = (col.song_ids ?? []) as string[]
  await client.from('collections').update({ song_ids: ids.filter((s) => s !== songId), updated_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true })
}
