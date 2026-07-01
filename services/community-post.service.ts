// 커뮤니티 글(뉴스피드) — 작성(멤버 가드)·피드·삭제·고정(매니저)·좋아요·댓글.
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyCommunityModeration } from '@/services/community.service'
import { findBannedWord } from '@/services/moderation.service'
import type { CommunityPost, CommunityPostComment, CommunityPoll } from '@/types/domain'

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
  songs?: { id?: string; title?: string | null; cover_image?: string | null; cover_hue?: number | null; audio_url?: string | null } | null
  communities?: { name?: string; avatar_image?: string | null } | null
}

const POST_SELECT =
  'id, community_id, author_id, content, image_url, image_urls, link_url, song_id, pinned, like_count, comment_count, created_at, profiles!author_id(username, display_name, avatar_url, avatar_hue), songs!song_id(id, title, cover_image, cover_hue, audio_url), communities!community_id(name, avatar_image)'

function rowToPost(r: PostRow): CommunityPost {
  return {
    id: r.id,
    communityId: r.community_id,
    authorId: r.author_id,
    authorName: r.profiles?.display_name ?? r.profiles?.username ?? null,
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
    song: r.songs ? { id: r.songs.id as string, title: r.songs.title ?? null, coverImage: r.songs.cover_image ?? null, coverHue: r.songs.cover_hue ?? null, audioUrl: r.songs.audio_url ?? null } : null,
    communityName: r.communities?.name ?? null,
    communityAvatar: r.communities?.avatar_image ?? null,
  }
}

async function isMember(admin: ReturnType<typeof createAdminClient>, communityId: string, userId: string): Promise<boolean> {
  const { data } = await admin.from('community_members').select('user_id').eq('community_id', communityId).eq('user_id', userId).maybeSingle()
  return !!data
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
  if (!(await isMember(admin, communityId, userId))) {
    // 매니저는 멤버 행이 없어도 글 가능 (자동가입 누락 안전망)
    const { data: c } = await admin.from('communities').select('manager_id').eq('id', communityId).maybeSingle()
    if (c?.manager_id !== userId) return { ok: false, error: 'not_member' }
  }
  const content = input.content.trim()
  const imageUrls = (input.imageUrls ?? []).slice(0, 10)
  const linkUrl = input.linkUrl?.trim() || null
  const pollOptions = input.poll ? input.poll.options.map((o) => o.trim()).filter(Boolean).slice(0, 4) : []
  const hasPoll = pollOptions.length >= 2
  if (!content && imageUrls.length === 0 && !input.songId && !linkUrl && !hasPoll) return { ok: false, error: 'empty' }
  if (await findBannedWord(content, ...pollOptions)) return { ok: false, error: 'banned_word' }
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
export async function getPopularPosts(userId?: string, limit = 10): Promise<CommunityPost[]> {
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
export async function editPost(userId: string, postId: string, content: string): Promise<{ ok: true; post: CommunityPost } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const text = content.trim()
  if (text && await findBannedWord(text)) return { ok: false, error: 'banned_word' }
  const { data: post } = await admin.from('community_posts').select('author_id, song_id, image_url, image_urls, link_url').eq('id', postId).maybeSingle()
  if (!post) return { ok: false, error: 'not_found' }
  if (post.author_id !== userId) return { ok: false, error: 'forbidden' }
  // 본문/첨부 중 하나는 남아 있어야 (첨부는 수정에서 건드리지 않음)
  const hasMedia = !!post.song_id || !!post.image_url || (Array.isArray(post.image_urls) && post.image_urls.length > 0) || !!post.link_url
  if (!text && !hasMedia) return { ok: false, error: 'empty' }
  const { data, error } = await admin
    .from('community_posts')
    .update({ content: text })
    .eq('id', postId)
    .select(POST_SELECT)
    .single()
  if (error) { console.error('[community-post.edit]', error.message); return { ok: false, error: 'internal' } }
  return { ok: true, post: rowToPost(data as PostRow) }
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
  const { data: existing } = await admin.from('community_post_likes').select('user_id').eq('post_id', postId).eq('user_id', userId).maybeSingle()
  let liked: boolean
  if (existing) { await admin.from('community_post_likes').delete().eq('post_id', postId).eq('user_id', userId); liked = false }
  else { const { error } = await admin.from('community_post_likes').insert({ post_id: postId, user_id: userId }); if (error) return { ok: false, error: 'internal' }; liked = true }
  const { data: refreshed } = await admin.from('community_posts').select('like_count').eq('id', postId).maybeSingle()
  return { ok: true, liked, likeCount: refreshed?.like_count ?? 0 }
}

// 댓글 작성 — 로그인 유저 누구나. parentId 있으면 대댓글.
export async function addComment(userId: string, postId: string, body: string, parentId?: string | null): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const text = body.trim()
  if (!text) return { ok: false, error: 'empty' }
  if (await findBannedWord(text)) return { ok: false, error: 'banned_word' }
  const { data: post } = await admin.from('community_posts').select('id').eq('id', postId).maybeSingle()
  if (!post) return { ok: false, error: 'not_found' }
  // 대댓글이면 부모가 같은 글의 최상위 댓글인지 검증 (1단계만 허용)
  if (parentId) {
    const { data: parent } = await admin.from('community_post_comments').select('post_id, parent_id').eq('id', parentId).maybeSingle()
    if (!parent || parent.post_id !== postId) return { ok: false, error: 'bad_parent' }
    // 대댓글에 다시 대댓글 → 최상위 부모로 평탄화
    if (parent.parent_id) parentId = parent.parent_id
  }
  const { error } = await admin.from('community_post_comments').insert({ post_id: postId, user_id: userId, body: text, parent_id: parentId ?? null })
  if (error) { console.error('[community-post.comment]', error.message); return { ok: false, error: 'internal' } }
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
  const { data: c } = await admin.from('community_post_comments').select('id').eq('id', commentId).maybeSingle()
  if (!c) return { ok: false, error: 'not_found' }
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
