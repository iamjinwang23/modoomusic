// 커뮤니티(카페) — 개설/폐쇄/가입/탈퇴/조회/허브. 서버 전용(admin client). 정책 가드 포함.
import { createAdminClient } from '@/lib/supabase/admin'
import type { Community, CommunityMember } from '@/types/domain'

interface CommunityRow {
  id: string
  manager_id: string
  name: string
  topic: string | null
  description: string | null
  cover_image: string | null
  cover_focus: string | null
  avatar_image: string | null
  member_count: number
  created_at: string
}

function rowToCommunity(r: CommunityRow): Community {
  return {
    id: r.id,
    managerId: r.manager_id,
    name: r.name,
    topic: r.topic,
    description: r.description,
    coverImage: r.cover_image,
    coverFocus: r.cover_focus,
    avatarImage: r.avatar_image,
    memberCount: r.member_count,
    createdAt: r.created_at,
  }
}

const SELECT = 'id, manager_id, name, topic, description, cover_image, cover_focus, avatar_image, member_count, created_at'

// 개설 — 1인 1개. 단, 관리자(is_admin)는 테스트·운영 위해 다중 개설 허용. 개설자 자동 가입.
export async function createCommunity(
  userId: string,
  input: { name: string; topic?: string | null; description?: string | null; coverImage?: string | null },
): Promise<{ ok: true; community: Community } | { ok: false; error: string }> {
  const admin = createAdminClient()
  // 1인 1개 제한 — 관리자는 예외
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  if (!prof?.is_admin) {
    const { data: existing } = await admin.from('communities').select('id').eq('manager_id', userId).limit(1).maybeSingle()
    if (existing) return { ok: false, error: 'already_has_community' }
  }
  const { data, error } = await admin
    .from('communities')
    .insert({
      manager_id: userId,
      name: input.name,
      topic: input.topic ?? null,
      description: input.description ?? null,
      cover_image: input.coverImage ?? null,
    })
    .select(SELECT)
    .single()
  if (error) {
    console.error('[community.create]', error.message)
    return { ok: false, error: 'internal' }
  }
  // 개설자 자동 가입
  const { error: joinErr } = await admin.from('community_members').insert({ community_id: data.id, user_id: userId })
  if (joinErr) console.error('[community.create] 자동가입 실패:', joinErr.message)
  return { ok: true, community: rowToCommunity(data as CommunityRow) }
}

// 정보 수정 — 매니저만. name/topic/description/cover_image/avatar_image 부분 갱신.
export async function updateCommunity(
  userId: string,
  communityId: string,
  patch: { name?: string; topic?: string | null; description?: string | null; coverImage?: string | null; coverFocus?: string | null; avatarImage?: string | null },
): Promise<{ ok: true; community: Community } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== userId) return { ok: false, error: 'forbidden' }

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name.length < 2 || name.length > 30) return { ok: false, error: 'invalid_name' }
    update.name = name
  }
  if (patch.topic !== undefined) update.topic = patch.topic?.trim() || null
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.coverImage !== undefined) update.cover_image = patch.coverImage
  if (patch.coverFocus !== undefined) update.cover_focus = patch.coverFocus
  if (patch.avatarImage !== undefined) update.avatar_image = patch.avatarImage
  if (Object.keys(update).length === 0) return { ok: false, error: 'empty' }

  const { data, error } = await admin.from('communities').update(update).eq('id', communityId).select(SELECT).single()
  if (error) { console.error('[community.update]', error.message); return { ok: false, error: 'internal' } }
  const community = rowToCommunity(data as CommunityRow)
  community.isMember = true; community.isManager = true
  return { ok: true, community }
}

// 폐쇄 — 매니저만. cascade로 멤버·글·댓글·좋아요 삭제.
export async function closeCommunity(userId: string, communityId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== userId) return { ok: false, error: 'forbidden' }
  const { error } = await admin.from('communities').delete().eq('id', communityId)
  if (error) { console.error('[community.close]', error.message); return { ok: false, error: 'internal' } }
  return { ok: true }
}

// 가입 — 멱등(이미 멤버면 무시).
export async function joinCommunity(userId: string, communityId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('id').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  const { error } = await admin.from('community_members').upsert(
    { community_id: communityId, user_id: userId },
    { onConflict: 'community_id,user_id', ignoreDuplicates: true },
  )
  if (error) { console.error('[community.join]', error.message); return { ok: false, error: 'internal' } }
  return { ok: true }
}

// 탈퇴 — 매니저는 불가(폐쇄해야 함).
export async function leaveCommunity(userId: string, communityId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id === userId) return { ok: false, error: 'manager_cannot_leave' }
  await admin.from('community_members').delete().eq('community_id', communityId).eq('user_id', userId)
  return { ok: true }
}

// 단건 조회 (+ 현재 유저 가입/매니저 여부)
export async function getCommunity(communityId: string, userId?: string): Promise<Community | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('communities').select(SELECT).eq('id', communityId).maybeSingle()
  if (!data) return null
  const community = rowToCommunity(data as CommunityRow)
  if (userId) {
    const { data: m } = await admin
      .from('community_members').select('user_id')
      .eq('community_id', communityId).eq('user_id', userId).maybeSingle()
    community.isMember = !!m
    community.isManager = community.managerId === userId
  }
  return community
}

// 멤버 목록 (프로필 조인)
export async function listMembers(communityId: string, limit = 50): Promise<CommunityMember[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('community_members')
    .select('user_id, joined_at, profiles!user_id(username, display_name, avatar_url, avatar_hue)')
    .eq('community_id', communityId)
    .order('joined_at', { ascending: true })
    .limit(limit)
  return (data ?? []).map((r) => {
    const p = (r as { profiles?: { username?: string; display_name?: string; avatar_url?: string; avatar_hue?: number } }).profiles
    return {
      userId: r.user_id as string,
      displayName: p?.display_name ?? null,
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
      avatarHue: p?.avatar_hue ?? null,
      joinedAt: r.joined_at as string,
    }
  })
}

// 허브 — 인기 커뮤니티(멤버순)·신규·내 가입 커뮤니티
export async function getHub(userId?: string): Promise<{
  popular: Community[]
  recent: Community[]
  mine: Community[]
}> {
  const admin = createAdminClient()
  const [popularRes, recentRes] = await Promise.all([
    admin.from('communities').select(SELECT).order('member_count', { ascending: false }).limit(20),
    admin.from('communities').select(SELECT).order('created_at', { ascending: false }).limit(12),
  ])
  const popular = (popularRes.data ?? []).map((r) => rowToCommunity(r as CommunityRow))
  const recent = (recentRes.data ?? []).map((r) => rowToCommunity(r as CommunityRow))

  let mine: Community[] = []
  if (userId) {
    const { data: mem } = await admin.from('community_members').select('community_id').eq('user_id', userId)
    const ids = (mem ?? []).map((m) => m.community_id as string)
    if (ids.length) {
      const { data } = await admin.from('communities').select(SELECT).in('id', ids).order('member_count', { ascending: false })
      mine = (data ?? []).map((r) => rowToCommunity(r as CommunityRow))
    }
  }
  return { popular, recent, mine }
}

// 현재 유저가 매니저인 커뮤니티(있으면) — 개설 한도 체크용
export async function getMyManagedCommunity(userId: string): Promise<Community | null> {
  const admin = createAdminClient()
  // 관리자는 여러 개일 수 있으니 limit(1) — maybeSingle 다중행 에러 방지
  const { data } = await admin.from('communities').select(SELECT).eq('manager_id', userId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data ? rowToCommunity(data as CommunityRow) : null
}
