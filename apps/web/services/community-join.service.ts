// 커뮤니티 비공개 가입 — 신청/목록/승인/거절. 서버 전용(admin). 매니저 가드 포함.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/services/push.service'
import { notifyJoinDecision } from '@/services/community.service'
import { isRejoinCooldownActive } from '@mono/shared'
import type { CommunityJoinRequest } from '@mono/shared'

// 신청 — 비공개 전용. 차단·쿨다운·중복 방어. 매니저에게 신청 알림.
export async function requestJoin(userId: string, communityId: string): Promise<{ ok: boolean; error?: string; status?: 'pending' }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id, name, visibility, status').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.visibility !== 'private') return { ok: false, error: 'not_private' }
  if (c.status === 'closing') return { ok: false, error: 'community_closing' }

  const { data: mem } = await admin.from('community_members').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (mem) return { ok: false, error: 'already_member' }

  const { data: blk } = await admin.from('community_blocks').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (blk) return { ok: false, error: 'blocked' }

  const { data: existing } = await admin.from('community_join_requests').select('status, decided_at').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  if (existing?.status === 'pending') return { ok: true, status: 'pending' }  // 멱등
  if (existing?.status === 'rejected' && existing.decided_at && isRejoinCooldownActive(existing.decided_at as string, Date.now())) {
    return { ok: false, error: 'rejoin_cooldown' }
  }

  // 신규 or 쿨다운 지난 재신청 — pending 으로 upsert(status/시각 리셋)
  const { error } = await admin.from('community_join_requests').upsert(
    { community_id: communityId, user_id: userId, status: 'pending', reason: null, decided_at: null, decided_by: null, created_at: new Date().toISOString() },
    { onConflict: 'community_id,user_id' },
  )
  if (error) { console.error('[community.requestJoin]', error.message); return { ok: false, error: 'internal' } }

  // 매니저 신청 알림
  const managerId = c.manager_id as string
  const title = '새 가입 신청'
  const body = `'${c.name as string}'에 새 가입 신청이 있어요.`
  const url = `/community/${communityId}`
  admin.from('notifications').insert({ user_id: managerId, type: 'community_join_request', payload: { title, body, url } })
    .then(({ error: e }) => { if (e) console.error('[community.requestJoin.notify]', e.message) })
  sendPushToUser(managerId, { title, body, url }).catch(() => {})
  return { ok: true, status: 'pending' }
}

// 매니저 가드 헬퍼 — 커뮤니티 소유 확인.
async function assertManager(admin: ReturnType<typeof createAdminClient>, managerId: string, communityId: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { data: c } = await admin.from('communities').select('manager_id, name').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== managerId) return { ok: false, error: 'forbidden' }
  return { ok: true, name: (c.name as string) ?? '' }
}

// pending 목록 — 매니저만. 프로필 조인.
export async function listJoinRequests(managerId: string, communityId: string): Promise<{ ok: boolean; error?: string; requests?: CommunityJoinRequest[] }> {
  const admin = createAdminClient()
  const guard = await assertManager(admin, managerId, communityId)
  if (!guard.ok) return { ok: false, error: guard.error }
  const { data } = await admin.from('community_join_requests')
    .select('user_id, created_at, profiles!user_id(username, display_name, avatar_url, avatar_hue)')
    .eq('community_id', communityId).eq('status', 'pending')
    .order('created_at', { ascending: true })
  const requests: CommunityJoinRequest[] = (data ?? []).map((r) => {
    const p = (r as { profiles?: { username?: string; display_name?: string; avatar_url?: string; avatar_hue?: number } }).profiles
    return {
      userId: r.user_id as string,
      displayName: p?.display_name ?? null,
      username: p?.username ?? null,
      avatarUrl: p?.avatar_url ?? null,
      avatarHue: p?.avatar_hue ?? null,
      createdAt: r.created_at as string,
    }
  })
  return { ok: true, requests }
}

// 승인 — 매니저만. 멤버 편입 + 신청행 삭제 + 승인 알림.
export async function approveRequest(managerId: string, communityId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const guard = await assertManager(admin, managerId, communityId)
  if (!guard.ok) return { ok: false, error: guard.error }
  const { data: req } = await admin.from('community_join_requests').select('status').eq('community_id', communityId).eq('user_id', targetUserId).maybeSingle()
  if (!req || req.status !== 'pending') return { ok: false, error: 'not_pending' }
  await admin.from('community_members').upsert(
    { community_id: communityId, user_id: targetUserId },
    { onConflict: 'community_id,user_id', ignoreDuplicates: true },
  )
  await admin.from('community_join_requests').delete().eq('community_id', communityId).eq('user_id', targetUserId)
  notifyJoinDecision(admin, targetUserId, guard.name, communityId, 'approved')
  return { ok: true }
}

// 거절 — 매니저만. status=rejected + 사유 + decided_at(쿨다운 기준) + 거절 알림.
export async function rejectRequest(managerId: string, communityId: string, targetUserId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const guard = await assertManager(admin, managerId, communityId)
  if (!guard.ok) return { ok: false, error: guard.error }
  const { data: req } = await admin.from('community_join_requests').select('status').eq('community_id', communityId).eq('user_id', targetUserId).maybeSingle()
  if (!req || req.status !== 'pending') return { ok: false, error: 'not_pending' }
  const { error } = await admin.from('community_join_requests')
    .update({ status: 'rejected', reason: reason?.trim().slice(0, 300) || null, decided_at: new Date().toISOString(), decided_by: managerId })
    .eq('community_id', communityId).eq('user_id', targetUserId)
  if (error) { console.error('[community.rejectRequest]', error.message); return { ok: false, error: 'internal' } }
  notifyJoinDecision(admin, targetUserId, guard.name, communityId, 'rejected', reason?.trim().slice(0, 300) || undefined)
  return { ok: true }
}
