// genre/mood가 NULL인 공개 곡들에 inferTags로 추출한 값 채움.
// Vercel Cron이 nightly 호출. 신규 곡은 /api/generate INSERT 단계에서 inferTags가 채우므로 누락 보완용.
// 시간 지나면서 클라이언트 후처리(getByFilter inferTags 매칭) 비용 점진 감소.
//
// ?force=1 옵션: NULL뿐 아니라 전체 곡 재평가. 사전 변경 후 일회성 마이그레이션에 사용.
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

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === '1'

  const admin = createAdminClient()
  const query = admin.from('songs').select('id, prompt, title, lyrics, genre, mood').limit(2000)
  if (!force) query.or('genre.is.null,mood.is.null')
  const { data, error } = await query
  if (error) {
    console.error('[cron backfill-tags]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  for (const row of (data ?? []) as SongRow[]) {
    const inferred = inferTags({ prompt: row.prompt, title: row.title, lyrics: row.lyrics })
    const patch: Partial<Pick<SongRow, 'genre' | 'mood'>> = {}
    if (force) {
      // 전체 재평가: 현재 값과 다르면 덮어씀 (사전 변경 마이그레이션)
      if (inferred.genre !== row.genre) patch.genre = inferred.genre
      if (inferred.mood !== row.mood) patch.mood = inferred.mood
    } else {
      // NULL 보완만
      if (!row.genre && inferred.genre) patch.genre = inferred.genre
      if (!row.mood && inferred.mood) patch.mood = inferred.mood
    }
    if (Object.keys(patch).length === 0) continue
    const { error: upErr } = await admin.from('songs').update(patch).eq('id', row.id)
    if (upErr) {
      console.error('[cron backfill-tags] update', row.id, upErr.message)
      continue
    }
    updated++
  }

  return NextResponse.json({ ok: true, mode: force ? 'force' : 'null-only', scanned: data?.length ?? 0, updated })
}
