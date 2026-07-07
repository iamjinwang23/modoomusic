// Design Ref: comments §4 — PATCH 본인 댓글 수정 / DELETE 본인 댓글 삭제(대댓글 cascade)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { findBannedWord } from '@/services/moderation.service'
import type { Comment } from '@mono/shared'

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

function toComment(r: CommentRow, liked: boolean): Comment {
  return {
    id: r.id,
    songId: r.song_id,
    userId: r.user_id,
    parentId: r.parent_id,
    body: r.body,
    likeCount: r.like_count,
    liked,
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null
  const text = typeof body?.body === 'string' ? body.body.trim() : ''

  if (!text) return NextResponse.json({ error: '댓글을 입력해 주세요', code: 'INVALID' }, { status: 400 })
  if (text.length > 500) return NextResponse.json({ error: '댓글은 500자 이내로 작성해 주세요', code: 'INVALID' }, { status: 400 })
  if (await findBannedWord(text)) return NextResponse.json({ error: '부적절한 표현이 포함되어 있어요', code: 'BANNED' }, { status: 400 })

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })

  // UPDATE: RLS가 본인 댓글만 허용. 0 row면 권한 없음 또는 미존재
  const { data: updated, error } = await userClient
    .from('comments')
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq('id', id)
    .select(COMMENT_SELECT)
    .maybeSingle()

  if (error) {
    console.error('[comments PATCH]', error.message)
    return NextResponse.json({ error: '수정에 실패했어요' }, { status: 500 })
  }
  if (!updated) return NextResponse.json({ error: '댓글을 수정할 권한이 없어요' }, { status: 403 })

  // 본인 좋아요 여부
  const { data: like } = await userClient
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', user.id)
    .eq('comment_id', id)
    .maybeSingle()

  return NextResponse.json({ comment: toComment(updated as unknown as CommentRow, !!like) })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })

  // RLS가 본인만 허용. 대댓글은 ON DELETE CASCADE로 함께 제거.
  const { error, count } = await userClient
    .from('comments')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) {
    console.error('[comments DELETE]', error.message)
    return NextResponse.json({ error: '삭제에 실패했어요' }, { status: 500 })
  }
  if (!count || count === 0) {
    return NextResponse.json({ error: '댓글을 삭제할 권한이 없어요' }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
