// Design Ref: comments §4 — POST 좋아요 토글 (있으면 unlike, 없으면 like)
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: commentId } = await params
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })

  // 댓글 존재 확인 (RLS는 공개 곡 댓글만 SELECT 허용)
  const { data: comment, error: cErr } = await userClient
    .from('comments')
    .select('id')
    .eq('id', commentId)
    .maybeSingle()
  if (cErr || !comment) return NextResponse.json({ error: '댓글을 찾을 수 없어요' }, { status: 404 })

  // 현재 상태 조회 → 토글
  const { data: existing } = await userClient
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', user.id)
    .eq('comment_id', commentId)
    .maybeSingle()

  if (existing) {
    const { error } = await userClient
      .from('comment_likes')
      .delete()
      .eq('user_id', user.id)
      .eq('comment_id', commentId)
    if (error) {
      console.error('[comment like DELETE]', error.message)
      return NextResponse.json({ error: '좋아요 취소에 실패했어요' }, { status: 500 })
    }
  } else {
    const { error } = await userClient
      .from('comment_likes')
      .insert({ user_id: user.id, comment_id: commentId })
    if (error) {
      console.error('[comment like INSERT]', error.message)
      return NextResponse.json({ error: '좋아요에 실패했어요' }, { status: 500 })
    }
  }

  // 갱신된 like_count (트리거가 동기화)
  const { data: updated } = await userClient
    .from('comments')
    .select('like_count')
    .eq('id', commentId)
    .maybeSingle()

  return NextResponse.json({
    liked: !existing,
    likeCount: (updated as { like_count: number } | null)?.like_count ?? 0,
  })
}
