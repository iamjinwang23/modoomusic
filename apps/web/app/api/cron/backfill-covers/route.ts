// 커버 null 곡 백필 — cover_image IS NULL AND status='done' 곡의 커버를 재생성·업로드.
// 이미지 API 과부하로 생성 시 커버가 조용히 실패(null)한 곡의 사후 복구용. 수동 트리거(크론 미등록).
//   GET /api/cron/backfill-covers?key={CRON_SECRET}  (또는 Authorization: Bearer)
//   호출당 3곡 처리(이미지 API가 느릴 때 개당 최대 ~80s — 함수 300s 한도 내). remaining 0 될 때까지 반복 호출.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCoverImage, craftCoverPrompt } from '@/services/minimax.service'
import { uploadFromUrl } from '@/services/storage.service'

export const maxDuration = 300
const BATCH = 3

export async function GET(req: Request) {
  const url = new URL(req.url)
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || (auth !== `Bearer ${secret}` && url.searchParams.get('key') !== secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: songs, error } = await admin
    .from('songs')
    .select('id, title, genre, mood, lyrics, prompt')
    .is('cover_image', null)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(BATCH)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fixed: string[] = []
  const failed: string[] = []
  for (const s of songs ?? []) {
    const fallback = [s.genre, s.mood, s.prompt?.slice(0, 200)].filter(Boolean).join(', ') || 'abstract emotional album cover'
    const crafted = await craftCoverPrompt({
      genre: s.genre ?? undefined, mood: s.mood ?? undefined,
      title: s.title ?? undefined, lyrics: s.lyrics ?? undefined,
    })
    let img = await generateCoverImage(crafted || fallback)
    if (!img) img = await generateCoverImage(fallback)
    if (!img) { failed.push(s.id); continue }
    const perm = await uploadFromUrl(img, 'songs-covers', `${s.id}-backfill.webp`, { toWebp: { maxPx: 800, quality: 85 } })
    if (!perm) { failed.push(s.id); continue }
    await admin.from('songs').update({ cover_image: perm }).eq('id', s.id)
    fixed.push(s.id)
  }

  const { count } = await admin
    .from('songs')
    .select('id', { count: 'exact', head: true })
    .is('cover_image', null)
    .eq('status', 'done')
  return NextResponse.json({ ok: true, fixed, failed, remaining: count ?? 0 })
}
