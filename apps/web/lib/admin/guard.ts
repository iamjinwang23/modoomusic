// Design Ref: §7 Security — 3중 가드 중 layout·API server-side 검증 공용 헬퍼.
// 클라이언트 가드는 보조용 — 실제 권한 차단은 항상 서버에서.
// 권한 세분화: admin_permissions NULL = 최고관리자 / 배열 = 제한.

import { createUserClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { hasPermission, type AdminModule } from './modules'

export interface AdminContext {
  userId: string
  isAdmin: true
  permissions: string[] | null  // NULL = 최고관리자
}

/**
 * Server Component 용 가드.
 * is_admin=false면 redirect('/'). requiredModule이 있고 권한 없으면 redirect('/admin').
 */
export async function requireAdminOrRedirect(requiredModule?: AdminModule): Promise<AdminContext> {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, admin_permissions')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/')

  const permissions = (profile.admin_permissions as string[] | null) ?? null
  if (requiredModule && !hasPermission(permissions, requiredModule)) {
    redirect('/admin')  // 권한 없는 모듈은 대시보드로
  }

  return { userId: user.id, isAdmin: true, permissions }
}

/**
 * API Route Handler 용 가드.
 */
export async function requireAdminApi(
  requiredModule?: AdminModule,
): Promise<
  | { ok: true; ctx: AdminContext }
  | { ok: false; status: 401 | 403; error: 'unauthenticated' | 'forbidden' | 'no_permission' }
> {
  const supabase = await createUserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, admin_permissions')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) return { ok: false, status: 403, error: 'forbidden' }

  const permissions = (profile.admin_permissions as string[] | null) ?? null
  if (requiredModule && !hasPermission(permissions, requiredModule)) {
    return { ok: false, status: 403, error: 'no_permission' }
  }

  return { ok: true, ctx: { userId: user.id, isAdmin: true, permissions } }
}

/**
 * 최고관리자만 — 관리자 등록/회수 API에서 사용.
 */
export async function requireSuperAdminApi(): Promise<
  | { ok: true; ctx: AdminContext }
  | { ok: false; status: 401 | 403; error: 'unauthenticated' | 'forbidden' | 'no_permission' | 'not_super_admin' }
> {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth
  if (auth.ctx.permissions !== null) {
    return { ok: false, status: 403, error: 'not_super_admin' }
  }
  return auth
}
