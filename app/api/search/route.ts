// Design Ref: search §4.1 — GET /api/search?q=...
// 인증 옵셔널, 로그인 시 isLiked·isFollowing 후처리

import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { searchAll } from '@/services/search.service'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!q) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  const results = await searchAll(q, user?.id ?? null)
  return NextResponse.json({ data: results })
}
