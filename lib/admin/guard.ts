// Design Ref: §7 Security — 3중 가드 중 layout·API server-side 검증 공용 헬퍼.
// 클라이언트 가드는 보조용 — 실제 권한 차단은 항상 서버에서.

import { createUserClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface AdminContext {
  userId: string
  isAdmin: true
}

/**
 * Server Component / Server Action 용 가드.
 * profiles.is_admin = true 가 아니면 redirect('/').
 * 통과 시 { userId, isAdmin: true } 반환.
 */
export async function requireAdminOrRedirect(): Promise<AdminContext> {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/')

  return { userId: user.id, isAdmin: true }
}

/**
 * API Route Handler 용 가드.
 * 401 (unauthenticated) 또는 403 (forbidden) 응답을 위한 결과 객체 반환.
 * 통과 시 ctx, 실패 시 NextResponse 직접 반환.
 */
export async function requireAdminApi(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; status: 401 | 403; error: 'unauthenticated' | 'forbidden' }
> {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) return { ok: false, status: 403, error: 'forbidden' }

  return { ok: true, ctx: { userId: user.id, isAdmin: true } }
}
