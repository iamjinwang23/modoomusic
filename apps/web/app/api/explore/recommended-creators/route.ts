// Design Ref: recommended-creators §4 — GET /api/explore/recommended-creators
// 로그인: 5+2+1 = 8명 / 비로그인: 트렌딩 8명
// 인증 옵셔널 (비로그인 허용)

import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { getRecommendedCreators } from '@/services/recommendations.service'

export async function GET() {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  const creators = await getRecommendedCreators(user?.id ?? null)
  return NextResponse.json({ data: creators })
}
