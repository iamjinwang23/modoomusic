// POST /api/communities/[id]/cancel-closing — 폐쇄 철회(매니저, 유예 중). §13.2
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { cancelClosing } from '@/services/community.service'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await cancelClosing(user.id, id)
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'not_found' ? 404 : result.error === 'not_closing' ? 409 : 500
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
