// DELETE /api/admin/banned-words/[id] — 삭제 (어드민)
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'
import { removeBannedWord } from '@/services/moderation.service'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  await removeBannedWord(id)
  return NextResponse.json({ ok: true })
}
