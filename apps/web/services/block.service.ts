import type { SupabaseClient } from '@supabase/supabase-js'

// 사용자 차단 서비스.
// - 피드 필터(브라우저 client, RLS 양방향 SELECT) 와 서버 API(admin client, RLS 우회) 양쪽에서 재사용.
// - getBlockedUserIds: 양방향 합집합(내가 차단 + 나를 차단) → 피드 상호 숨김용.
// - listBlocked: "내가 차단한" 사람만 → 차단 목록 UI용.

// 양방향 합집합 id 목록. select-only라 어떤 client를 넘겨도 동작(RLS 양방향 or 우회).
export async function getBlockedUserIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const [{ data: iBlocked }, { data: blockedMe }] = await Promise.all([
    client.from('user_blocks').select('blocked_id').eq('blocker_id', userId),
    client.from('user_blocks').select('blocker_id').eq('blocked_id', userId),
  ])
  const ids = new Set<string>()
  for (const r of iBlocked ?? []) ids.add(r.blocked_id as string)
  for (const r of blockedMe ?? []) ids.add(r.blocker_id as string)
  return [...ids]
}

// 차단 생성 + 양방향 언팔로우. admin client 전용(RLS 우회로 상대 follows도 삭제).
export async function createBlock(admin: SupabaseClient, blockerId: string, blockedId: string): Promise<void> {
  await admin.from('user_blocks').upsert(
    { blocker_id: blockerId, blocked_id: blockedId },
    { onConflict: 'blocker_id,blocked_id' },
  )
  await admin.from('follows').delete().eq('follower_id', blockerId).eq('following_id', blockedId)
  await admin.from('follows').delete().eq('follower_id', blockedId).eq('following_id', blockerId)
}

export async function removeBlock(admin: SupabaseClient, blockerId: string, blockedId: string): Promise<void> {
  await admin.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId)
}

export interface BlockedProfile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  avatar_hue: number | null
}

// "내가 차단한" 사람 목록(최신순). 차단 목록 UI용.
export async function listBlocked(admin: SupabaseClient, userId: string): Promise<BlockedProfile[]> {
  const { data } = await admin
    .from('user_blocks')
    .select('blocked_id, created_at, profiles!blocked_id(id, username, display_name, avatar_url, avatar_hue)')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? [])
    .map((r) => {
      // PostgREST가 to-one 조인을 배열로 추론 → 배열/단일 모두 흡수.
      const p = (r as { profiles: BlockedProfile | BlockedProfile[] | null }).profiles
      return Array.isArray(p) ? p[0] ?? null : p
    })
    .filter((p): p is BlockedProfile => Boolean(p))
}
