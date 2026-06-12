// Design Ref: admin Module 4 — 정지·탈퇴 사용자가 서버 API를 통해 컨텐츠 생성하거나
// 액션 수행하는 걸 차단. AuthProvider 클라이언트 가드의 server-side 방어선.

import { createUserClient } from '@/lib/supabase/server'

export type ActiveUserResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401; error: 'unauthenticated' }
  | { ok: false; status: 403; error: 'account_suspended'; reason: string | null }
  | { ok: false; status: 410; error: 'account_deleted' }

/**
 * 인증된 사용자 + 정지/탈퇴 안 된 상태를 보장.
 * mutation API(곡 생성, 댓글, 좋아요 등)에서 첫 줄에 호출:
 *
 *   const auth = await requireActiveUser()
 *   if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
 *   // 이후 auth.userId 로 사용
 */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('suspended_at, suspended_reason, deleted_at')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.deleted_at) {
    return { ok: false, status: 410, error: 'account_deleted' }
  }
  if (profile?.suspended_at) {
    return {
      ok: false,
      status: 403,
      error: 'account_suspended',
      reason: profile.suspended_reason ?? null,
    }
  }

  return { ok: true, userId: user.id }
}
