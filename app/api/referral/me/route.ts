// Design Ref: referral §5.3 — GET /api/referral/me (모달 표시용)

import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getMyReferral } from '@/services/referral.service'

export async function GET() {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const my = await getMyReferral(user.id)
  if (!my) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    data: {
      code: my.code,
      count: my.count,
      bonus_received: my.bonusReceived,
    },
  })
}
