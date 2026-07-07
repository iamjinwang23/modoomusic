// GET /api/songs/mine — 인증 유저의 곡 리스트(RN 라이브러리용). 웹은 client supabase 직접쿼리라 앱용 REST 신설.
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { listMySongs } from '@/services/song-query.service'

export async function GET() {
  const client = await createUserClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const songs = await listMySongs(client, user.id)
  return NextResponse.json({ songs })
}
