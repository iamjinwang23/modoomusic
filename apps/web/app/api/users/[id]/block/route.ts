import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBlock, removeBlock } from '@/services/block.service'

// POST /api/users/[id]/block — 대상 유저 차단 + 양방향 언팔로우. 멱등(재차단 200).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: targetId } = await params
  if (targetId === user.id) return NextResponse.json({ error: 'cannot_block_self' }, { status: 400 })
  await createBlock(createAdminClient(), user.id, targetId)
  return NextResponse.json({ ok: true })
}

// DELETE /api/users/[id]/block — 차단 해제.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: targetId } = await params
  await removeBlock(createAdminClient(), user.id, targetId)
  return NextResponse.json({ ok: true })
}
