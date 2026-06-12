// 현재 로그인 어드민의 권한 정보 — UI에서 최고관리자 여부 판단 등.

import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/guard'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({
    data: {
      userId: auth.ctx.userId,
      permissions: auth.ctx.permissions,
      isSuperAdmin: auth.ctx.permissions === null,
    },
  })
}
