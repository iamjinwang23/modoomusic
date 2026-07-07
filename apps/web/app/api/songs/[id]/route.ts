// GET /api/songs/[id] — 곡 상세(RN). RLS가 공개/본인 접근 통제. (하위 라우트 /like·/comments 등과 별개)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getSongById } from '@/services/song-query.service'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await createUserClient()
  const song = await getSongById(client, id)
  if (!song) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ song })
}
