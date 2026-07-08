// 커뮤니티 글(뉴스피드) — 작성(멤버 가드)·피드·삭제·고정(매니저)·좋아요·댓글.
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCommunityModeration, isCommunityClosing } from '@/services/community.service'
import { sendPushToUser } from '@/services/push.service'
import { findBannedWord } from '@/services/moderation.service'
import type { CommunityPost, CommunityPostComment, CommunityPoll } from '@mono/shared'

// 커뮤니티 소셜 알림(좋아요·댓글·답글) — 인앱(actor 아바타 렌더) + 웹푸시. 본인 대상/중복은 호출부에서 가드.
async function notifyCommunityActivity(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    recipientId: string
    actorId: string
    type: 'community_like' | 'community_comment'
    kind?: 'comment' | 'reply'
    communityId: string
    postId: string
    pushTitle: string
    pushBody: string
  },
): Promise<void> {
  if (opts.recipientId === opts.actorId) return
  const url = `/community/${opts.communityId}?post=${opts.postId}`
  // 좋아요는 재발송 방지(껐다 켰다 스팸) — 같은 대상·행위자·글에 이미 있으면 스킵
  if (opts.type === 'community_like') {
    const { data: dup } = await admin
      .from('notifications')
      .select('id')
      .eq('user_id', opts.recipientId)
      .eq('actor_id', opts.actorId)
      .eq('type', 'community_like')
      .eq('payload->>postId', opts.postId)
      .limit(1)
      .maybeSingle()
    if (dup) return
  }
  const payload: Record<string, unknown> = { url, postId: opts.postId, communityId: opts.communityId }
  if (opts.kind) payload.kind = opts.kind
  const { error } = await admin.from('notifications').insert({
    user_id: opts.recipientId,
    actor_id: opts.actorId,
    type: opts.type,
    payload,
  })
  if (error) { console.error('[community.notifyActivity]', error.message); return }
  sendPushToUser(opts.recipientId, { title: opts.pushTitle, body: opts.pushBody, url, data: { route: `/community/${opts.communityId}` } }, 'community').catch(() => {})
}

interface PostRow {
  id: string
  community_id: string
  author_id: string
  content: string
  image_url: string | null
  image_urls: string[] | null
  link_url: string | null
  song_id: string | null
  pinned: boolean
  like_count: number
  comment_count: number
  created_at: string
  profiles?: { username?: string; display_name?: string; avatar_url?: string; avatar_hue?: number }
  songs?: { id?: string; title?: string | null; cover_image?: string | null; cover_hue?: number | null; audio_url?: string | null; duration?: number | null } | null
  communities?: { name?: string; avatar_image?: string | null; cover_image?: string | null } | null
}

const POST_SELECT =
  'id, community_id, author_id, content, image_url, image_urls, link_url, song_id, pinned, like_count, comment_count, created_at, profiles!author_id(username, display_name, avatar_url, avatar_hue), songs!song_id(id, title, cover_image, cover_hue, audio_url, duration), communities!community_id(name, avatar_image, cover_image)'

function rowToPost(r: PostRow): CommunityPost {
  return {
    id: r.id,
    communityId: r.community_id,
    authorId: r.author_id,
    authorName: r.profiles?.display_name ?? r.profiles?.username ?? null,
    authorUsername: r.profiles?.username ?? null,
    authorAvatarUrl: r.profiles?.avatar_url ?? null,
    authorAvatarHue: r.profiles?.avatar_hue ?? null,
    content: r.content,
    imageUrl: r.image_url,
    imageUrls: r.image_urls ?? [],
    linkUrl: r.link_url ?? null,
    songId: r.song_id,
    pinned: r.pinned,
    likeCount: r.like_count,
    commentCount: r.comment_count,
    createdAt: r.created_at,
    song: r.songs ? { id: r.songs.id as string, title: r.songs.title ?? null, coverImage: r.songs.cover_image ?? null, coverHue: r.songs.cover_hue ?? null, audioUrl: r.songs.audio_url ?? null, duration: r.songs.duration ?? null } : null,
    communityName: r.communities?.name ?? null,
    communityAvatar: r.communities?.avatar_image ?? null,
    communityCover: r.communities?.cover_image ?? null,
  }
}

// 서버측 길이 상한 — 클라 maxLength 우회(직접 API 호출) 대비. UI와 동일 기준.
const MAX = { content: 500, comment: 500, pollOption: 40 } as const

// 링크는 http(s)만 저장 — javascript: 등 스킴이 href로 렌더되는 저장형 XSS 차단
function toSafeHttpUrl(raw?: string | null): string | null {
  const t = raw?.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    if (u.protocol === 'http:' || u.protocol === 'https:') return t
  } catch {}
  return null
}

async function isMember(admin: ReturnType<typeof createAdminClient>, communityId: string, userId: string): Promise<boolean> {
  const { data } = await admin.from('community_members').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  return !!data
}

// 첨부 곡 검증 — 본인 소유 + 공개(게시)된 곡만 허용
async function isPublicOwnedSong(admin: ReturnType<typeof createAdminClient>, userId: string, songId: string): Promise<boolean> {
  const { data } = await admin.from('songs').select('user_id, is_public').eq('id', songId).maybeSingle()
  return !!data && data.user_id === userId && data.is_public === true
}

// 현재 유저가 좋아요한 post id 집합 채우기
async function fillLiked(admin: ReturnType<typeof createAdminClient>, posts: CommunityPost[], userId?: string): Promise<CommunityPost[]> {
  if (!userId || posts.length === 0) return posts
  const ids = posts.map((p) => p.id)
  const { data } = await admin.from('community_post_likes').select('post_id').eq('user_id', userId).in('post_id', ids)
  const set = new Set((data ?? []).map((l) => l.post_id as string))
  return posts.map((p) => ({ ...p, liked: set.has(p.id) }))
}

// 글 작성 — 멤버만. content·이미지·곡·링크 중 하나는 있어야.
export async function createPost(
  userId: string,
  communityId: string,
  input: { content: string; imageUrls?: string[] | null; linkUrl?: string | null; songId?: string | null; poll?: { options: string[] } | null },
): Promise<{ ok: true; post: CommunityPost } | { ok: false; error: string }> {
  const admin = createAdminClient()
  if (await isCommunityClosing(admin, communityId)) return { ok: false, error: 'community_closing' }  // 폐쇄 유예 = 읽기전용
  if (!(await isMember(admin, communityId, userId))) {
    // 매니저는 멤버 행이 없어도 글 가능 (자동가입 누락 안전망)
    const { data: c } = await admin.from('communities').select('manager_id').eq('id', communityId).maybeSingle()
    if (c?.manager_id !== userId) return { ok: false, error: 'not_member' }
  }
  const content = input.content.trim().slice(0, MAX.content)
  const imageUrls = (input.imageUrls ?? []).slice(0, 10)
  const linkUrl = toSafeHttpUrl(input.linkUrl)
  const pollOptions = input.poll ? input.poll.options.map((o) => o.trim().slice(0, MAX.pollOption)).filter(Boolean).slice(0, 4) : []
  const hasPoll = pollOptions.length >= 2
  if (!content && imageUrls.length === 0 && !input.songId && !linkUrl && !hasPoll) return { ok: false, error: 'empty' }
  if (await findBannedWord(content, ...pollOptions)) return { ok: false, error: 'banned_word' }
  // 곡 첨부는 본인의 게시(공개)된 곡만 — 비공개곡 첨부 차단
  if (input.songId && !(await isPublicOwnedSong(admin, userId, input.songId))) return { ok: false, error: 'song_not_public' }
  const { data, error } = await admin
    .from('community_posts')
    .insert({ community_id: communityId, author_id: userId, content, image_urls: imageUrls, link_url: linkUrl, song_id: input.songId ?? null })
    .select(POST_SELECT)
    .single()
  if (error) { console.error('[community-post.create]', error.message); return { ok: false, error: 'internal' } }
  const post = rowToPost(data as PostRow)
  if (hasPoll) {
    const endsAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    const { error: pErr } = await admin.from('community_post_polls').insert({ post_id: data.id, options: pollOptions, ends_at: endsAt })
    if (pErr) console.error('[community-post.poll]', pErr.message)
    else post.poll = { options: pollOptions, endsAt, counts: pollOptions.map(() => 0), totalVotes: 0, myVote: null }
  }
  return { ok: true, post }
}

interface PollRow { post_id: string; options: string[]; ends_at: string }
interface PollVoteRow { post_id: string; user_id: string; option_index: number }

// 피드 posts에 투표 데이터(집계·내 표) 채우기
async function fillPolls(admin: ReturnType<typeof createAdminClient>, posts: CommunityPost[], userId?: string): Promise<CommunityPost[]> {
  if (posts.length === 0) return posts
  const ids = posts.map((p) => p.id)
  const [pollsRes, votesRes] = await Promise.all([
    admin.from('community_post_polls').select('post_id, options, ends_at').in('post_id', ids),
    admin.from('community_post_poll_votes').select('post_id, user_id, option_index').in('post_id', ids),
  ])
  const polls = (pollsRes.data ?? []) as PollRow[]
  if (polls.length === 0) return posts
  const votes = (votesRes.data ?? []) as PollVoteRow[]
  const pollMap = new Map(polls.map((p) => [p.post_id, p]))
  const tally = new Map<string, { counts: number[]; total: number; myVote: number | null }>()
  for (const p of polls) tally.set(p.post_id, { counts: p.options.map(() => 0), total: 0, myVote: null })
  for (const v of votes) {
    const t = tally.get(v.post_id)
    if (!t) continue
    if (v.option_index >= 0 && v.option_index < t.counts.length) t.counts[v.option_index]++
    t.total++
    if (userId && v.user_id === userId) t.myVote = v.option_index
  }
  return posts.map((post) => {
    const poll = pollMap.get(post.id)
    if (!poll) return post
    const t = tally.get(post.id)!
    return { ...post, poll: { options: poll.options, endsAt: poll.ends_at, counts: t.counts, totalVotes: t.total, myVote: t.myVote } }
  })
}

// 투표 — 단일 선택, 1인 1표, 종료 후 불가
export async function votePoll(userId: string, postId: string, optionIndex: number): Promise<{ ok: boolean; poll?: CommunityPoll; error?: string }> {
  const admin = createAdminClient()
  // 블라인드(hidden) 글에는 투표 불가
  const { data: post } = await admin.from('community_posts').select('status, community_id').eq('id', postId).maybeSingle()
  if (!post || post.status !== 'active') return { ok: false, error: 'not_found' }
  if (await isCommunityClosing(admin, post.community_id as string)) return { ok: false, error: 'community_closing' }
  const { data: poll } = await admin.from('community_post_polls').select('options, ends_at').eq('post_id', postId).maybeSingle()
  if (!poll) return { ok: false, error: 'not_found' }
  const options = poll.options as string[]
  if (new Date(poll.ends_at as string).getTime() <= Date.now()) return { ok: false, error: 'ended' }
  if (optionIndex < 0 || optionIndex >= options.length) return { ok: false, error: 'invalid_option' }
  const { error } = await admin.from('community_post_poll_votes').insert({ post_id: postId, user_id: userId, option_index: optionIndex })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'already_voted' }
    console.error('[community-post.votePoll]', error.message)
    return { ok: false, error: 'internal' }
  }
  const { data: votes } = await admin.from('community_post_poll_votes').select('user_id, option_index').eq('post_id', postId)
  const counts = options.map(() => 0)
  let total = 0, myVote: number | null = null
  for (const v of (votes ?? []) as { user_id: string; option_index: number }[]) {
    if (v.option_index >= 0 && v.option_index < counts.length) counts[v.option_index]++
    total++
    if (v.user_id === userId) myVote = v.option_index
  }
  return { ok: true, poll: { options, endsAt: poll.ends_at as string, counts, totalVotes: total, myVote } }
}

// 커뮤니티 피드 — 고정글 우선, 최신순
export async function listPosts(communityId: string, userId?: string, limit = 50): Promise<CommunityPost[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('community_posts')
    .select(POST_SELECT)
    .eq('community_id', communityId)
    .eq('status', 'active')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  const posts = (data ?? []).map((r) => rowToPost(r as PostRow))
  return fillPolls(admin, await fillLiked(admin, posts, userId), userId)
}

// 허브 인기글 — 전체 커뮤니티 활성글, 좋아요순
export async function getPopularPosts(userId?: string, limit = 9): Promise<CommunityPost[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('community_posts')
    .select(POST_SELECT)
    .eq('status', 'active')
    .order('like_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  const posts = (data ?? []).map((r) => rowToPost(r as PostRow))
  return fillPolls(admin, await fillLiked(admin, posts, userId), userId)
}

// 삭제 — 작성자 또는 커뮤니티 매니저. 매니저가 남의 글 삭제 시 작성자에게 알림.
export async function deletePost(userId: string, postId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: post } = await admin.from('community_posts').select('author_id, community_id').eq('id', postId).maybeSingle()
  if (!post) return { ok: false, error: 'not_found' }
  const isAuthor = post.author_id === userId
  let allowed = isAuthor
  let communityName = ''
  if (!isAuthor) {
    const { data: c } = await admin.from('communities').select('manager_id, name').eq('id', post.community_id).maybeSingle()
    allowed = c?.manager_id === userId
    communityName = c?.name ?? ''
  }
  if (!allowed) return { ok: false, error: 'forbidden' }
  await admin.from('community_posts').delete().eq('id', postId)
  if (!isAuthor) {
    await notifyCommunityModeration(post.author_id, '게시글이 삭제되었어요', `'${communityName}' 커뮤니티에서 회원님의 게시글이 삭제되었어요.`, `/community/${post.community_id}`)
  }
  return { ok: true }
}

// 본문 수정 — 작성자 본인만
export async function editPost(
  userId: string,
  postId: string,
  content: string,
  imageUrls?: string[],
  songId?: string | null,
  pollOptions?: string[] | null,
): Promise<{ ok: true; post: CommunityPost } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const text = content.trim().slice(0, MAX.content)
  // 본문 + 투표 옵션 금칙어 검사 (수정 시 투표 옵션 미검사 이슈 픽스)
  const editPollOpts = pollOptions ? pollOptions.map(o => o.trim().slice(0, MAX.pollOption)).filter(Boolean) : null
  if (await findBannedWord(text, ...(editPollOpts ?? []))) return { ok: false, error: 'banned_word' }
  const { data: post } = await admin.from('community_posts').select('author_id, song_id, image_url, image_urls, link_url').eq('id', postId).maybeSingle()
  if (!post) return { ok: false, error: 'not_found' }
  if (post.author_id !== userId) return { ok: false, error: 'forbidden' }
  const newImages = imageUrls ?? (Array.isArray(post.image_urls) ? post.image_urls : [])
  // 새로 곡을 붙이는 경우만 검증(기존 곡 보존은 통과). 본인 게시(공개) 곡만.
  if (songId && songId !== post.song_id && !(await isPublicOwnedSong(admin, userId, songId))) return { ok: false, error: 'song_not_public' }
  const newSongId = songId !== undefined ? songId : post.song_id
  // 임베드는 본문 URL 자동 감지로 대체 — link_url은 편집 대상 아님, 기존값 보존만.
  const hasMedia = !!newSongId || newImages.length > 0 || !!post.image_url || !!post.link_url || (pollOptions && pollOptions.length >= 2)
  if (!text && !hasMedia) return { ok: false, error: 'empty' }
  const { data, error } = await admin
    .from('community_posts')
    .update({ content: text, image_urls: newImages, song_id: newSongId ?? null })
    .eq('id', postId)
    .select(POST_SELECT)
    .single()
  if (error) { console.error('[community-post.edit]', error.message); return { ok: false, error: 'internal' } }
  // 투표 처리
  if (pollOptions !== undefined) {
    const validOpts = editPollOpts ?? []
    if (validOpts.length >= 2) {
      // upsert — 기존 투표 있으면 옵션 업데이트, 없으면 새로 생성
      const { data: existing } = await admin.from('community_post_polls').select('post_id').eq('post_id', postId).maybeSingle()
      if (existing) {
        await admin.from('community_post_polls').update({ options: validOpts }).eq('post_id', postId)
      } else {
        const endsAt = new Date(Date.now() + 86400000).toISOString()
        await admin.from('community_post_polls').insert({ post_id: postId, options: validOpts, ends_at: endsAt })
      }
    } else {
      // 옵션 부족 → 투표 삭제
      await admin.from('community_post_polls').delete().eq('post_id', postId)
    }
  }
  const result = rowToPost(data as PostRow)
  // 투표 정보 다시 채우기
  if (pollOptions !== undefined) {
    const validOpts = editPollOpts ?? []
    if (validOpts.length >= 2) {
      const { data: poll } = await admin.from('community_post_polls').select('options, ends_at').eq('post_id', postId).maybeSingle()
      if (poll) result.poll = { options: poll.options as string[], endsAt: poll.ends_at as string, counts: (poll.options as string[]).map(() => 0), totalVotes: 0, myVote: null }
    }
  }
  return { ok: true, post: result }
}

// 고정 토글 — 매니저만
export async function togglePin(userId: string, postId: string): Promise<{ ok: boolean; pinned?: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: post } = await admin.from('community_posts').select('pinned, community_id').eq('id', postId).maybeSingle()
  if (!post) return { ok: false, error: 'not_found' }
  const { data: c } = await admin.from('communities').select('manager_id').eq('id', post.community_id).maybeSingle()
  if (c?.manager_id !== userId) return { ok: false, error: 'forbidden' }
  const next = !post.pinned
  await admin.from('community_posts').update({ pinned: next }).eq('id', postId)
  return { ok: true, pinned: next }
}

// 좋아요 토글 — 로그인 유저 누구나
export async function toggleLike(userId: string, postId: string): Promise<{ ok: boolean; liked?: boolean; likeCount?: number; error?: string }> {
  const admin = createAdminClient()
  // 블라인드(hidden) 글에는 좋아요 불가
  const { data: target } = await admin.from('community_posts').select('status, community_id').eq('id', postId).maybeSingle()
  if (!target || target.status !== 'active') return { ok: false, error: 'not_found' }
  if (await isCommunityClosing(admin, target.community_id as string)) return { ok: false, error: 'community_closing' }
  const { data: existing } = await admin.from('community_post_likes').select('user_id').eq('post_id', postId).eq('user_id', userId).maybeSingle()
  let liked: boolean
  if (existing) { await admin.from('community_post_likes').delete().eq('post_id', postId).eq('user_id', userId); liked = false }
  else { const { error } = await admin.from('community_post_likes').insert({ post_id: postId, user_id: userId }); if (error) return { ok: false, error: 'internal' }; liked = true }
  const { data: refreshed } = await admin.from('community_posts').select('like_count, author_id, community_id').eq('id', postId).maybeSingle()
  // 좋아요 눌렀을 때만 글 작성자에게 알림(취소·본인·중복 제외)
  if (liked && refreshed?.author_id && refreshed.author_id !== userId) {
    const { data: actor } = await admin.from('profiles').select('display_name, username').eq('id', userId).maybeSingle()
    const actorName = actor?.display_name ?? actor?.username ?? '누군가'
    await notifyCommunityActivity(admin, {
      recipientId: refreshed.author_id as string, actorId: userId, type: 'community_like',
      communityId: refreshed.community_id as string, postId,
      pushTitle: '새 좋아요', pushBody: `${actorName}님이 회원님의 글을 좋아했어요`,
    })
  }
  return { ok: true, liked, likeCount: refreshed?.like_count ?? 0 }
}

// 댓글 작성 — 로그인 유저 누구나. parentId 있으면 대댓글.
export async function addComment(userId: string, postId: string, body: string, parentId?: string | null): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const text = body.trim().slice(0, MAX.comment)
  if (!text) return { ok: false, error: 'empty' }
  if (await findBannedWord(text)) return { ok: false, error: 'banned_word' }
  const { data: post } = await admin.from('community_posts').select('id, author_id, community_id, status').eq('id', postId).maybeSingle()
  if (!post || post.status !== 'active') return { ok: false, error: 'not_found' }
  if (await isCommunityClosing(admin, post.community_id as string)) return { ok: false, error: 'community_closing' }
  // 대댓글이면 부모가 같은 글의 최상위 댓글인지 검증 (1단계만 허용)
  let parentAuthorId: string | null = null
  if (parentId) {
    const { data: parent } = await admin.from('community_post_comments').select('post_id, parent_id, user_id').eq('id', parentId).maybeSingle()
    if (!parent || parent.post_id !== postId) return { ok: false, error: 'bad_parent' }
    parentAuthorId = parent.user_id as string
    // 대댓글에 다시 대댓글 → 최상위 부모로 평탄화 (알림 대상은 실제 지목한 댓글 작성자 유지)
    if (parent.parent_id) parentId = parent.parent_id
  }
  const { error } = await admin.from('community_post_comments').insert({ post_id: postId, user_id: userId, body: text, parent_id: parentId ?? null })
  if (error) { console.error('[community-post.comment]', error.message); return { ok: false, error: 'internal' } }

  // 알림 — 답글이면 부모 댓글 작성자에게, 아니면 글 작성자에게 (본인 제외)
  const { data: actor } = await admin.from('profiles').select('display_name, username').eq('id', userId).maybeSingle()
  const actorName = actor?.display_name ?? actor?.username ?? '누군가'
  const communityId = post.community_id as string
  if (parentAuthorId) {
    await notifyCommunityActivity(admin, {
      recipientId: parentAuthorId, actorId: userId, type: 'community_comment', kind: 'reply',
      communityId, postId, pushTitle: '새 답글', pushBody: `${actorName}님이 회원님의 댓글에 답글을 남겼어요`,
    })
  } else if (post.author_id) {
    await notifyCommunityActivity(admin, {
      recipientId: post.author_id as string, actorId: userId, type: 'community_comment', kind: 'comment',
      communityId, postId, pushTitle: '새 댓글', pushBody: `${actorName}님이 회원님의 글에 댓글을 남겼어요`,
    })
  }
  return { ok: true }
}

interface CommentRow {
  id: string
  post_id: string
  parent_id: string | null
  user_id: string
  body: string
  created_at: string
  edited_at: string | null
  like_count: number
  profiles?: { username?: string; display_name?: string; avatar_url?: string; avatar_hue?: number }
}

function rowToComment(r: CommentRow): CommunityPostComment {
  const p = r.profiles
  return {
    id: r.id,
    postId: r.post_id,
    parentId: r.parent_id,
    authorId: r.user_id,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    likeCount: r.like_count ?? 0,
    liked: false,
    user: { username: p?.username ?? '', displayName: p?.display_name ?? null, avatarUrl: p?.avatar_url ?? null, avatarHue: p?.avatar_hue ?? null },
    replies: [],
  }
}

// 댓글 목록 — 최상위 + replies 중첩, 현재 유저 좋아요 여부 채움
export async function listComments(postId: string, userId?: string): Promise<CommunityPostComment[]> {
  const admin = createAdminClient()
  // 블라인드(hidden) 글의 댓글은 노출하지 않음
  const { data: post } = await admin.from('community_posts').select('status').eq('id', postId).maybeSingle()
  if (!post || post.status !== 'active') return []
  const { data } = await admin
    .from('community_post_comments')
    .select('id, post_id, parent_id, user_id, body, created_at, edited_at, like_count, profiles!user_id(username, display_name, avatar_url, avatar_hue)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(300)
  const rows = (data ?? []).map((r) => rowToComment(r as CommentRow))
  // 좋아요 여부 채우기
  if (userId && rows.length > 0) {
    const ids = rows.map((c) => c.id)
    const { data: likes } = await admin.from('community_post_comment_likes').select('comment_id').eq('user_id', userId).in('comment_id', ids)
    const set = new Set((likes ?? []).map((l) => l.comment_id as string))
    for (const c of rows) c.liked = set.has(c.id)
  }
  const byId = new Map(rows.map((c) => [c.id, c]))
  const top: CommunityPostComment[] = []
  for (const c of rows) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.replies!.push(c)
    else top.push(c)
  }
  return top
}

// 댓글 좋아요 토글 — 로그인 유저 누구나
export async function toggleCommentLike(userId: string, commentId: string): Promise<{ ok: boolean; liked?: boolean; likeCount?: number; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('community_post_comments').select('id, post_id').eq('id', commentId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  const { data: post } = await admin.from('community_posts').select('community_id').eq('id', c.post_id).maybeSingle()
  if (post && await isCommunityClosing(admin, post.community_id as string)) return { ok: false, error: 'community_closing' }
  const { data: existing } = await admin.from('community_post_comment_likes').select('user_id').eq('comment_id', commentId).eq('user_id', userId).maybeSingle()
  let liked: boolean
  if (existing) { await admin.from('community_post_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId); liked = false }
  else { const { error } = await admin.from('community_post_comment_likes').insert({ comment_id: commentId, user_id: userId }); if (error) return { ok: false, error: 'internal' }; liked = true }
  const { data: refreshed } = await admin.from('community_post_comments').select('like_count').eq('id', commentId).maybeSingle()
  return { ok: true, liked, likeCount: refreshed?.like_count ?? 0 }
}

// 댓글 수정 — 작성자 본인만
export async function editComment(userId: string, commentId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const text = body.trim()
  if (!text) return { ok: false, error: 'empty' }
  if (await findBannedWord(text)) return { ok: false, error: 'banned_word' }
  const { data: c } = await admin.from('community_post_comments').select('user_id').eq('id', commentId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  if (c.user_id !== userId) return { ok: false, error: 'forbidden' }
  const { error } = await admin.from('community_post_comments').update({ body: text, edited_at: new Date().toISOString() }).eq('id', commentId)
  if (error) { console.error('[community-post.editComment]', error.message); return { ok: false, error: 'internal' } }
  return { ok: true }
}

// 댓글 삭제 — 작성자 본인 또는 커뮤니티 매니저 (대댓글은 CASCADE)
export async function deleteComment(userId: string, commentId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: c } = await admin.from('community_post_comments').select('user_id, post_id').eq('id', commentId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
  let allowed = c.user_id === userId
  if (!allowed) {
    const { data: post } = await admin.from('community_posts').select('community_id').eq('id', c.post_id).maybeSingle()
    if (post) {
      const { data: com } = await admin.from('communities').select('manager_id').eq('id', post.community_id).maybeSingle()
      allowed = com?.manager_id === userId
    }
  }
  if (!allowed) return { ok: false, error: 'forbidden' }
  await admin.from('community_post_comments').delete().eq('id', commentId)
  return { ok: true }
}

export interface ExportPost {
  content: string
  images: string[]
  linkUrl: string | null
  songTitle: string | null
  songUrl: string | null
  createdAt: string
}
export interface MemberExport {
  community: { id: string; name: string }
  exportedAt: string
  posts: ExportPost[]
}

// 본인 글 내보내기 — 이 커뮤니티에서 내가 쓴 글을 사람이 읽을 수 있는 백업으로. §13.3 세이프가드 ③.
// 멤버 가드는 라우트에서. 곡은 제목+오디오 URL, 이미지·링크는 URL 참조(개인 보관 콘텐츠는 폐쇄로 사라지지 않음).
export async function exportMemberContent(userId: string, communityId: string): Promise<MemberExport | null> {
  const admin = createAdminClient()
  const { data: community } = await admin.from('communities').select('id, name').eq('id', communityId).maybeSingle()
  if (!community) return null

  const { data: posts } = await admin.from('community_posts')
    .select('id, content, image_url, image_urls, link_url, created_at, songs!song_id(title, audio_url)')
    .eq('community_id', communityId).eq('author_id', userId)
    .order('created_at', { ascending: true })

  return {
    community: { id: community.id as string, name: community.name as string },
    exportedAt: new Date().toISOString(),
    posts: (posts ?? []).map((p) => {
      const song = (p as { songs?: { title?: string | null; audio_url?: string | null } | null }).songs
      return {
        content: (p.content as string) ?? '',
        images: ((p.image_urls as string[] | null) ?? (p.image_url ? [p.image_url as string] : [])),
        linkUrl: (p.link_url as string | null) ?? null,
        songTitle: song?.title ?? null,
        songUrl: song?.audio_url ?? null,
        createdAt: p.created_at as string,
      }
    }),
  }
}
