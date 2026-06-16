// Design Ref: §9 Service Layer — withAudit() 래퍼로 모든 mutation에 자동 감사 로그.
// Plan SC: (2) 모든 어드민 동작이 admin_actions에 기록.
//
// 사용 예:
//   const result = await withAudit({
//     adminUserId,
//     action: 'grant_credit',
//     targetType: 'user',
//     targetId: targetUserId,
//     reason,
//     payload: { amount, before: { bonus: 14 } },
//   }, async () => {
//     // mutation 실제 수행 (service_role admin client 사용)
//     const next = await supabase.from('profiles').update({...}).eq('id', targetUserId)
//     return next
//   })

import { createAdminClient } from '@/lib/supabase/admin'

export interface AuditContext {
  adminUserId: string
  action: AdminAction
  targetType: AdminTargetType
  targetId: string | null
  reason: string
  payload?: Record<string, unknown>
}

export type AdminAction =
  | 'grant_credit'
  | 'resolve_report'
  | 'suspend_user'
  | 'unsuspend_user'
  | 'force_delete_user'
  | 'unpublish_song'
  | 'delete_song'
  | 'delete_comment'
  | 'send_announcement'
  | 'create_announcement'
  | 'update_announcement'
  | 'delete_announcement'
  | 'update_model'
  | 'grant_admin'
  | 'revoke_admin'

export type AdminTargetType = 'user' | 'song' | 'comment' | 'report' | 'system'

const MIN_REASON = 5

export class AuditError extends Error {
  constructor(public code: 'reason_too_short' | 'audit_log_failed', message?: string) {
    super(message ?? code)
  }
}

/**
 * 어드민 mutation 실행 + 감사 로그 자동 INSERT.
 * 1) reason >= 5자 검증
 * 2) fn() 실행 (mutation)
 * 3) 성공 시 admin_actions INSERT (RPC 사용 — RLS 우회 + 서버 재검증)
 * 4) fn() 실패 시 audit 로그도 안 남김
 *
 * 트랜잭션 의미: 5(감사 로그) 실패 시에도 fn() 결과는 이미 커밋됨.
 * → 감사 로그 실패는 fatal (배포 전 모니터링 필수). 현재는 throw로 알림.
 */
export async function withAudit<T>(
  ctx: AuditContext,
  fn: () => Promise<T>,
): Promise<T> {
  if (ctx.reason.trim().length < MIN_REASON) {
    throw new AuditError('reason_too_short')
  }

  const result = await fn()

  const supabase = createAdminClient()
  const { error } = await supabase.rpc('record_admin_action', {
    p_admin_id: ctx.adminUserId,
    p_action: ctx.action,
    p_target_type: ctx.targetType,
    p_target_id: ctx.targetId,
    p_payload: (ctx.payload ?? {}) as Record<string, unknown>,
    p_reason: ctx.reason.trim(),
  })

  if (error) {
    console.error('[admin.service] audit log failed:', error.message, ctx)
    throw new AuditError('audit_log_failed', error.message)
  }

  return result
}
