// GET /api/admin/banned-words — 목록 / POST — 추가 (어드민)
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { listBannedWords, addBannedWord } from '@/services/moderation.service'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({ words: await listBannedWords() })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  let body: { word?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }) }
  if (typeof body.word !== 'string') return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  const result = await addBannedWord(body.word, auth.ctx.userId)
  if (!result.ok) {
    const status = result.error === 'duplicate' ? 409 : result.error === 'empty' ? 400 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
