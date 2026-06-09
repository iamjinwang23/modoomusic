// Design Ref: comments §4 — POST 대댓글 (parent_id=:id). 2단계는 DB 트리거가 거부
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

function toComment(r: CommentRow): Comment {
  return {
    id: r.id,
    songId: r.song_id,
    userId: r.user_id,
    parentId: r.parent_id,
    body: r.body,
    likeCount: r.like_count,
    liked: false,
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: parentId } = await params
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null
  const text = typeof body?.body === 'string' ? body.body.trim() : ''

  if (!text) return NextResponse.json({ error: '댓글을 입력해 주세요', code: 'INVALID' }, { status: 400 })
  if (text.length > 500) return NextResponse.json({ error: '댓글은 500자 이내로 작성해 주세요', code: 'INVALID' }, { status: 400 })

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })

  // 부모 댓글 + 곡 정보 (depth 1 강제 + 알림 정보)
  const admin = createAdminClient()
  const { data: parent, error: pErr } = await admin
    .from('comments')
    .select('id, song_id, user_id, parent_id, songs:song_id ( id, user_id, title, prompt, is_public )')
    .eq('id', parentId)
    .maybeSingle()
  if (pErr || !parent) return NextResponse.json({ error: '원댓글을 찾을 수 없어요' }, { status: 404 })
  if ((parent as { parent_id: string | null }).parent_id) {
    return NextResponse.json({ error: '대댓글에는 대댓글을 달 수 없어요', code: 'DEPTH' }, { status: 409 })
  }
  const song = (parent as unknown as { songs: { id: string; user_id: string; title: string | null; prompt: string | null; is_public: boolean } }).songs
  if (!song?.is_public) return NextResponse.json({ error: '비공개 곡엔 댓글을 남길 수 없어요', code: 'PRIVATE' }, { status: 403 })

  // INSERT 대댓글
  const { data: inserted, error: insErr } = await userClient
    .from('comments')
    .insert({ song_id: song.id, user_id: user.id, parent_id: parentId, body: text })
    .select(COMMENT_SELECT)
    .single()
  if (insErr || !inserted) {
    // 깊이 트리거가 거부했을 가능성
    if (insErr?.message?.includes('depth')) {
      return NextResponse.json({ error: '대댓글에는 대댓글을 달 수 없어요', code: 'DEPTH' }, { status: 409 })
    }
    console.error('[comments reply]', insErr?.message)
    return NextResponse.json({ error: '대댓글 작성에 실패했어요' }, { status: 500 })
  }

  // 알림 — 부모 댓글 작성자에게 (본인은 제외)
  const parentUserId = (parent as { user_id: string }).user_id
  if (parentUserId !== user.id) {
    const songTitle = (song.title && song.title.trim()) || (song.prompt ?? '').slice(0, 30) || '새 곡'
    const { error: nErr } = await admin.from('notifications').insert({
      user_id: parentUserId,
      actor_id: user.id,
      type: 'comment',
      song_id: song.id,
      comment_id: (inserted as unknown as { id: string }).id,
      payload: { kind: 'reply', songTitle },
    })
    if (nErr) console.error('[comments reply notif]', nErr.message)
  }

  return NextResponse.json({ comment: toComment(inserted as unknown as CommentRow) })
}
