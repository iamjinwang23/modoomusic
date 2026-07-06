// 커뮤니티(카페) — 개설/폐쇄/가입/탈퇴/조회/허브. 서버 전용(admin client). 정책 가드 포함.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/services/push.service'
import { findBannedWord } from '@/services/moderation.service'
import type { Community, CommunityMember } from '@/types/domain'

// 모더레이션(강퇴·게시물 삭제) 알림 — 시스템 알림 + 웹푸시
export async function notifyCommunityModeration(targetUserId: string, title: string, body: string, url: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('notifications').insert({ user_id: targetUserId, type: 'system', payload: { title, body, url } })
  if (error) console.error('[community.notify]', error.message)
  sendPushToUser(targetUserId, { title, body, url }).catch(() => {})
}

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
  status?: 'open' | 'closing'
  closing_at?: string | null
  close_scheduled_at?: string | null
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
    status: r.status ?? 'open',
    closingAt: r.closing_at ?? null,
    closeScheduledAt: r.close_scheduled_at ?? null,
  }
}

const SELECT = 'id, manager_id, name, topic, description, cover_image, cover_focus, avatar_image, member_count, created_at, status, closing_at, close_scheduled_at'

// 폐쇄 유예 기간 — 14일(§13.2 확정).
const CLOSING_GRACE_MS = 14 * 24 * 60 * 60 * 1000

// closing(폐쇄 유예) 커뮤니티는 읽기전용 — 신규 쓰기 차단 여부. status만 조회(쓰기 경로 가드용).
export async function isCommunityClosing(admin: ReturnType<typeof createAdminClient>, communityId: string): Promise<boolean> {
  const { data } = await admin.from('communities').select('status').eq('id', communityId).maybeSingle()
  return data?.status === 'closing'
}

// 개설 — 1인 1개. 단, 관리자(is_admin)는 테스트·운영 위해 다중 개설 허용. 개설자 자동 가입.
export async function createCommunity(
  userId: string,
  input: { name: string; topic?: string | null; description?: string | null; coverImage?: string | null },
): Promise<{ ok: true; community: Community } | { ok: false; error: string }> {
  const admin = createAdminClient()
  if (await findBannedWord(input.name, input.topic, input.description)) return { ok: false, error: 'banned_word' }
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
  if (await findBannedWord(patch.name, patch.topic, patch.description)) return { ok: false, error: 'banned_word' }

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name.length < 2 || name.length > 30) return { ok: false, error: 'invalid_name' }
    update.name = name
  }
  if (patch.topic !== undefined) update.topic = patch.topic?.trim().slice(0, 40) || null
  if (patch.description !== undefined) update.description = patch.description?.trim().slice(0, 500) || null
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

// 폐쇄 — 매니저만. §13.2 조건부:
//   다른 멤버(매니저 외) 콘텐츠 0건 → 즉시 하드삭제(cascade).
//   1건이라도 있으면 → 14일 유예(status=closing, 읽기전용) + 전 멤버 예고 알림. 스윕이 만료분 삭제.
export async function closeCommunity(
  userId: string,
  communityId: string,
): Promise<{ ok: boolean; error?: string; deleted?: boolean; closeScheduledAt?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id, name, status').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== userId) return { ok: false, error: 'forbidden' }
  if (c.status === 'closing') return { ok: false, error: 'already_closing' }

  // 다른 멤버 콘텐츠 존재 여부 — 글(author != manager) 또는 댓글(user != manager, 이 커뮤니티 글에 달린).
  // 오판 시 남의 콘텐츠를 즉시 삭제하게 되므로, 임베드 필터 대신 2-step으로 확실히 판정.
  const { data: othersPost } = await admin.from('community_posts')
    .select('id').eq('community_id', communityId).neq('author_id', userId).limit(1).maybeSingle()
  let hasOthersContent = !!othersPost
  if (!hasOthersContent) {
    const { data: postRows } = await admin.from('community_posts').select('id').eq('community_id', communityId)
    const postIds = (postRows ?? []).map((r) => r.id as string)
    if (postIds.length > 0) {
      const { data: othersComment } = await admin.from('community_post_comments')
        .select('id').in('post_id', postIds).neq('user_id', userId).limit(1).maybeSingle()
      hasOthersContent = !!othersComment
    }
  }

  if (!hasOthersContent) {
    // 즉시 하드삭제 — 보호할 남의 콘텐츠 없음(테스트 개설·회수용)
    const { error } = await admin.from('communities').delete().eq('id', communityId)
    if (error) { console.error('[community.close]', error.message); return { ok: false, error: 'internal' } }
    return { ok: true, deleted: true }
  }

  // 14일 유예 — closing 전환 + 타임스탬프
  const now = Date.now()
  const closingAt = new Date(now).toISOString()
  const closeScheduledAt = new Date(now + CLOSING_GRACE_MS).toISOString()
  const { error } = await admin.from('communities')
    .update({ status: 'closing', closing_at: closingAt, close_scheduled_at: closeScheduledAt })
    .eq('id', communityId)
  if (error) { console.error('[community.close]', error.message); return { ok: false, error: 'internal' } }

  await notifyClosing(admin, communityId, c.name as string, closeScheduledAt, userId)
  return { ok: true, deleted: false, closeScheduledAt }
}

// 폐쇄 철회 — 유예 중(closing) 매니저가 open으로 복귀(오조작·마음 변경 대비, §13.2).
export async function cancelClosing(userId: string, communityId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id, status').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== userId) return { ok: false, error: 'forbidden' }
  if (c.status !== 'closing') return { ok: false, error: 'not_closing' }
  const { error } = await admin.from('communities')
    .update({ status: 'open', closing_at: null, close_scheduled_at: null })
    .eq('id', communityId)
  if (error) { console.error('[community.cancelClosing]', error.message); return { ok: false, error: 'internal' } }
  return { ok: true }
}

// 스윕 — 유예 만료(close_scheduled_at <= now)된 closing 커뮤니티를 하드삭제(cascade). cron에서 호출.
export async function sweepClosedCommunities(): Promise<{ swept: number }> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data } = await admin.from('communities').select('id')
    .eq('status', 'closing').lte('close_scheduled_at', nowIso)
  const ids = (data ?? []).map((r) => r.id as string)
  if (ids.length === 0) return { swept: 0 }
  const { error } = await admin.from('communities').delete().in('id', ids)
  if (error) { console.error('[community.sweep]', error.message); return { swept: 0 } }
  return { swept: ids.length }
}

// 폐쇄 예고 알림 — 전 멤버에게(매니저 본인 제외) 인앱 알림 + 웹푸시. §13.3 세이프가드 ①.
async function notifyClosing(
  admin: ReturnType<typeof createAdminClient>,
  communityId: string,
  communityName: string,
  closeScheduledAt: string,
  managerId: string,
): Promise<void> {
  const { data: members } = await admin.from('community_members').select('user_id').eq('community_id', communityId)
  const recipients = (members ?? []).map((m) => m.user_id as string).filter((uid) => uid !== managerId)
  if (recipients.length === 0) return
  const d = new Date(closeScheduledAt)
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`
  const title = '커뮤니티 폐쇄 예고'
  const body = `'${communityName}' 커뮤니티가 ${dateLabel}에 폐쇄돼요. 그 전에 내가 작성한 글을 내보낼 수 있어요.`
  const url = `/community/${communityId}`
  const rows = recipients.map((uid) => ({
    user_id: uid, type: 'community_closing' as const, payload: { title, body, url, communityId, closeScheduledAt },
  }))
  const { error } = await admin.from('notifications').insert(rows)
  if (error) console.error('[community.notifyClosing]', error.message)
  for (const uid of recipients) sendPushToUser(uid, { title, body, url }).catch(() => {})
}

// 가입 — 멱등(이미 멤버면 무시).
export async function joinCommunity(userId: string, communityId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('id, status').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.status === 'closing') return { ok: false, error: 'community_closing' }  // 폐쇄 유예 중 가입 차단
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

// 강퇴 — 매니저만. 대상 멤버십 제거(매니저 자신은 불가).
export async function kickMember(userId: string, communityId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('communities').select('manager_id, name').eq('id', communityId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.manager_id !== userId) return { ok: false, error: 'forbidden' }
  if (targetUserId === c.manager_id) return { ok: false, error: 'cannot_kick_manager' }
  // 대상이 실제 멤버인지 확인 후 제거 — 비멤버에 대한 헛된 알림 방지
  const { data: mem } = await admin.from('community_members').select('user_id').eq('community_id', communityId).eq('user_id', targetUserId).maybeSingle()
  if (!mem) return { ok: false, error: 'not_member' }
  await admin.from('community_members').delete().eq('community_id', communityId).eq('user_id', targetUserId)
  await notifyCommunityModeration(targetUserId, '커뮤니티에서 내보내졌어요', `'${c.name}' 커뮤니티에서 내보내졌어요.`, `/community/${communityId}`)
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
  const since = new Date(Date.now() - 86400000).toISOString()

  const [popularRes, recentRes, recentPostsRes] = await Promise.all([
    admin.from('communities').select(SELECT).order('member_count', { ascending: false }).limit(20),
    admin.from('communities').select(SELECT).order('created_at', { ascending: false }).limit(12),
    admin.from('community_posts').select('community_id').gte('created_at', since),
  ])

  // 커뮤니티별 24h 게시글 수 집계
  const postCounts: Record<string, number> = {}
  for (const row of recentPostsRes.data ?? []) {
    const cid = row.community_id as string
    postCounts[cid] = (postCounts[cid] ?? 0) + 1
  }

  const withCount = (r: CommunityRow): Community => ({ ...rowToCommunity(r), recentPostCount: postCounts[r.id] ?? 0 })

  const popular = (popularRes.data ?? []).map((r) => withCount(r as CommunityRow))
  const recent = (recentRes.data ?? []).map((r) => withCount(r as CommunityRow))

  let mine: Community[] = []
  if (userId) {
    const { data: mem } = await admin.from('community_members').select('community_id').eq('user_id', userId)
    const ids = (mem ?? []).map((m) => m.community_id as string)
    if (ids.length) {
      const { data } = await admin.from('communities').select(SELECT).in('id', ids).order('member_count', { ascending: false })
      mine = (data ?? []).map((r) => withCount(r as CommunityRow))
    }
  }
  return { popular, recent, mine }
}

// 전체보기 — 타입별 커뮤니티 전체 리스트(24h 새 글 수 포함). posts는 community-post.service.getPopularPosts 사용.
export async function getCommunityList(
  type: 'popular' | 'new' | 'mine',
  userId?: string,
  limit = 100,
): Promise<Community[]> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 86400000).toISOString()

  let rows: CommunityRow[] = []
  if (type === 'popular') {
    const { data } = await admin.from('communities').select(SELECT).order('member_count', { ascending: false }).limit(limit)
    rows = (data ?? []) as CommunityRow[]
  } else if (type === 'new') {
    const { data } = await admin.from('communities').select(SELECT).order('created_at', { ascending: false }).limit(limit)
    rows = (data ?? []) as CommunityRow[]
  } else if (type === 'mine') {
    if (!userId) return []
    const { data: mem } = await admin.from('community_members').select('community_id').eq('user_id', userId)
    const ids = (mem ?? []).map((m) => m.community_id as string)
    if (!ids.length) return []
    const { data } = await admin.from('communities').select(SELECT).in('id', ids).order('member_count', { ascending: false }).limit(limit)
    rows = (data ?? []) as CommunityRow[]
  }
  if (!rows.length) return []

  // 24h 새 글 수 집계
  const { data: recentPosts } = await admin.from('community_posts').select('community_id').gte('created_at', since).in('community_id', rows.map((r) => r.id))
  const postCounts: Record<string, number> = {}
  for (const row of recentPosts ?? []) {
    const cid = row.community_id as string
    postCounts[cid] = (postCounts[cid] ?? 0) + 1
  }
  return rows.map((r) => ({ ...rowToCommunity(r), recentPostCount: postCounts[r.id] ?? 0 }))
}

// 현재 유저가 매니저인 커뮤니티(있으면) — 개설 한도 체크용
export async function getMyManagedCommunity(userId: string): Promise<Community | null> {
  const admin = createAdminClient()
  // 관리자는 여러 개일 수 있으니 limit(1) — maybeSingle 다중행 에러 방지
  const { data } = await admin.from('communities').select(SELECT).eq('manager_id', userId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data ? rowToCommunity(data as CommunityRow) : null
}
