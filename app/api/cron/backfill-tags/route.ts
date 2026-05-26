// genre/mood가 NULL인 공개 곡들에 inferTags로 추출한 값 채움.
// Vercel Cron이 nightly 호출. 신규 곡은 songService.save가 이미 채우므로 누락 보완용.
// 시간 지나면서 클라이언트 후처리(getByFilter inferTags 매칭) 비용 점진 감소.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inferTags } from '@/utils/extractTags'

interface SongRow {
  id: string
  prompt: string | null
  title: string | null
  lyrics: string | null
  genre: string | null
  mood: string | null
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('songs')
    .select('id, prompt, title, lyrics, genre, mood')
    .or('genre.is.null,mood.is.null')
    .limit(500)
  if (error) {
    console.error('[cron backfill-tags]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  for (const row of (data ?? []) as SongRow[]) {
    const inferred = inferTags({ prompt: row.prompt, title: row.title, lyrics: row.lyrics })
    const patch: Partial<Pick<SongRow, 'genre' | 'mood'>> = {}
    if (!row.genre && inferred.genre) patch.genre = inferred.genre
    if (!row.mood  && inferred.mood)  patch.mood  = inferred.mood
    if (Object.keys(patch).length === 0) continue
    const { error: upErr } = await admin.from('songs').update(patch).eq('id', row.id)
    if (upErr) {
      console.error('[cron backfill-tags] update', row.id, upErr.message)
      continue
    }
    updated++
  }

  return NextResponse.json({ ok: true, scanned: data?.length ?? 0, updated })
}
