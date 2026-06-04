// Design Ref: recommended-creators §3.2 — 추천 크리에이터 service
// 단일 함수 분기 (로그인/비로그인). Supabase RPC `recommended_creators(me uuid)` 호출.
// SECURITY DEFINER 함수가 profiles/songs/follows RLS 우회 → admin client 불필요, anon client로 충분.

import { createUserClient } from '@/lib/supabase/server'
import type { RecommendedCreator } from '@/types/domain'

interface RpcRow {
  id: string
  username: string
  display_name: string | null
  avatar_hue: number | null
  avatar_url: string | null
  follower_count: number | null
  bucket: number
}

export async function getRecommendedCreators(
  userId: string | null
): Promise<RecommendedCreator[]> {
  const supabase = await createUserClient()
  // Plan SC: 응답 시간 200ms 이하 — 단일 RPC 호출 (3 CTE)
  const { data, error } = await supabase.rpc('recommended_creators', { me: userId })

  if (error) {
    console.error('[recommendations.getRecommendedCreators]', error.message)
    return []
  }

  const rows = (data as RpcRow[] | null) ?? []
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name ?? r.username,
    avatarHue: r.avatar_hue ?? 0,
    avatarUrl: r.avatar_url,
    followerCount: r.follower_count ?? 0,
    bucket: r.bucket as 1 | 2 | 3,
  }))
}
