import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Params { id: string }

export async function POST(_req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.rpc('increment_play_count', { song_id: id })
  if (error) {
    console.error('[play increment]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
