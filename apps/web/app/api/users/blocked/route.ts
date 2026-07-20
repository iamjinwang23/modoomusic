import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listBlocked } from '@/services/block.service'

// GET /api/users/blocked — 내가 차단한 사용자 목록.
export async function GET() {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const blocked = await listBlocked(createAdminClient(), user.id)
  return NextResponse.json({ blocked })
}
