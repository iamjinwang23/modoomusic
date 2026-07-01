// POST /api/community-posts/[postId]/report — 게시글 신고. 중복은 멱등 200.
import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const REASONS = new Set([
  '욕설·비속어',
  '음란물',
  '혐오·차별 표현',
  '도배',
  '광고·홍보성 콘텐츠',
  '개인정보 노출',
  '저작권 침해',
  '기타',
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null
  const reason = typeof body?.reason === 'string' ? body.reason : ''

  if (!REASONS.has(reason)) {
    return NextResponse.json({ error: '신고 사유를 선택해 주세요', code: 'INVALID' }, { status: 400 })
  }

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('community_post_reports')
    .insert({ reporter_id: user.id, post_id: postId, reason })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true })  // 중복 멱등
    console.error('[community-post report]', error.message)
    return NextResponse.json({ error: '신고 접수에 실패했어요' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
