// Design Ref: comments §4 — POST 댓글 신고. 중복은 멱등 200
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: commentId } = await params
  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null
  const reason = typeof body?.reason === 'string' ? body.reason : ''

  if (!REASONS.has(reason)) {
    return NextResponse.json({ error: '신고 사유를 선택해 주세요', code: 'INVALID' }, { status: 400 })
  }

  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })

  // INSERT with idempotent dedupe — UNIQUE(reporter_id, comment_id) 충돌은 멱등 처리
  const admin = createAdminClient()
  const { error } = await admin
    .from('comment_reports')
    .insert({ reporter_id: user.id, comment_id: commentId, reason })

  if (error) {
    // 중복(unique 충돌)은 멱등 200
    if (error.code === '23505') {
      return NextResponse.json({ ok: true })
    }
    console.error('[comment report]', error.message)
    return NextResponse.json({ error: '신고 접수에 실패했어요' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
