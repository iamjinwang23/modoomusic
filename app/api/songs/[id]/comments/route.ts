// Design Ref: comments §4 — GET 곡 댓글(top+replies 통합) / POST 새 top-level 댓글
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Comment } from '@/types/domain'

type ProfileJoin = {
  username: string
  display_name: string | null
  avatar_url: string | null
  avatar_hue: number | null
} | null

type CommentRow = {
  id: string
  song_id: string
  user_id: string
  parent_id: string | null
  body: string
  like_count: number
  created_at: string
  edited_at: string | null
  profiles: ProfileJoin
}

const COMMENT_SELECT = `
  id, song_id, user_id, parent_id, body, like_count, created_at, edited_at,
  profiles!comments_user_id_fkey!inner ( username, display_name, avatar_url, avatar_hue )
`

function toComment(r: CommentRow, likedSet: Set<string>): Comment {
  return {
    id: r.id,
    songId: r.song_id,
    userId: r.user_id,
    parentId: r.parent_id,
    body: r.body,
    likeCount: r.like_count,
    liked: likedSet.has(r.id),
    createdAt: r.created_at,
    editedAt: r.edited_at,
    user: {
      username: r.profiles?.username ?? 'unknown',
      displayName: r.profiles?.display_name ?? null,
      avatarUrl: r.profiles?.avatar_url ?? null,
      avatarHue: r.profiles?.avatar_hue ?? null,
    },
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: songId } = await params
  const userClient = await createUserClient()

  // 댓글 + 작성자 프로필 (top + replies 한 번에 — 클라가 parentId로 그룹화)
  const { data: rows, error } = await userClient
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('song_id', songId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[comments GET]', error.message)
    return NextResponse.json({ error: '댓글을 불러오지 못했어요' }, { status: 500 })
  }

  // 현재 사용자의 좋아요 집합 (있으면)
  const { data: { user } } = await userClient.auth.getUser()
  let likedSet = new Set<string>()
  if (user && rows && rows.length > 0) {
    const ids = (rows as unknown as CommentRow[]).map((r) => r.id)
    const { data: likes } = await userClient
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', user.id)
      .in('comment_id', ids)
    likedSet = new Set((likes ?? []).map((l) => (l as { comment_id: string }).comment_id))
  }

  const comments = (rows as unknown as CommentRow[]).map((r) => toComment(r, likedSet))
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: songId } = await params
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null
  const text = typeof body?.body === 'string' ? body.body.trim() : ''

  if (!text) return NextResponse.json({ error: '댓글을 입력해 주세요', code: 'INVALID' }, { status: 400 })
  if (text.length > 500) return NextResponse.json({ error: '댓글은 500자 이내로 작성해 주세요', code: 'INVALID' }, { status: 400 })

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })

  // 곡 메타 (비공개 차단 + 알림에 쓸 owner·title)
  const admin = createAdminClient()
  const { data: song, error: songErr } = await admin
    .from('songs')
    .select('id, user_id, title, prompt, is_public')
    .eq('id', songId)
    .maybeSingle()
  if (songErr || !song) return NextResponse.json({ error: '곡을 찾을 수 없어요' }, { status: 404 })
  if (!song.is_public) return NextResponse.json({ error: '비공개 곡엔 댓글을 남길 수 없어요', code: 'PRIVATE' }, { status: 403 })

  // INSERT (RLS도 public 검증 — 이중)
  const { data: inserted, error: insErr } = await userClient
    .from('comments')
    .insert({ song_id: songId, user_id: user.id, body: text })
    .select(COMMENT_SELECT)
    .single()
  if (insErr || !inserted) {
    console.error('[comments POST]', insErr?.message)
    return NextResponse.json({ error: '댓글 작성에 실패했어요' }, { status: 500 })
  }

  // 알림 — 곡 소유자에게 (본인 곡엔 알림 X)
  if (song.user_id !== user.id) {
    const songTitle = (song.title && song.title.trim()) || (song.prompt ?? '').slice(0, 30) || '새 곡'
    const { error: nErr } = await admin.from('notifications').insert({
      user_id: song.user_id,
      actor_id: user.id,
      type: 'comment',
      song_id: songId,
      comment_id: (inserted as unknown as { id: string }).id,
      payload: { kind: 'comment', songTitle },
    })
    if (nErr) console.error('[comments POST notif]', nErr.message)
  }

  return NextResponse.json({ comment: toComment(inserted as unknown as CommentRow, new Set()) })
}
