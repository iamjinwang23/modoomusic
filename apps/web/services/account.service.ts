// Design Ref: account-deletion §7.1 — 회원 탈퇴 단일 service (Option C)
// soft delete + grace period(7일) + 영구 파기. 트랜잭션은 모두 RPC에서 처리.

import { createAdminClient } from '@/lib/supabase/admin'

export type DeletionReason = 'quality' | 'no_ideas' | 'switching' | 'privacy' | 'pause' | 'other'

const DELETION_REASONS: readonly DeletionReason[] = [
  'quality', 'no_ideas', 'switching', 'privacy', 'pause', 'other',
] as const

export function isDeletionReason(v: unknown): v is DeletionReason {
  return typeof v === 'string' && (DELETION_REASONS as readonly string[]).includes(v)
}

// Plan SC: 인앱 탈퇴 정상 동작 — soft delete + 사유 로그 (user_id 미저장)
export async function requestDeletion(
  userId: string,
  reason: DeletionReason,
  reasonText: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('request_account_deletion', {
    invoker_id: userId,
    reason_cat: reason,
    reason_txt: reasonText || null,
  })
  if (error) return { error: error.message }
  const result = data as { ok?: boolean; error?: string }
  if (result?.error) return { error: result.error }
  return { ok: true }
}

// Plan SC: 7일 내 재로그인 100% 복원
export async function restoreAccount(userId: string): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('restore_account', { invoker_id: userId })
  if (error) return { error: error.message }
  const result = data as { ok?: boolean; error?: string }
  if (result?.error) return { error: result.error }
  return { ok: true }
}

// Plan SC: 7일+ §7 데이터 처리. cleanup-notifications cron에 번들 호출됨.
// 사용자별 분리 try/catch — 한 명 실패가 다른 사람 정리 막지 않음.
export async function finalizeDeletions(): Promise<{ finalized: number; errors: number }> {
  const admin = createAdminClient()
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 영구 파기 대상 조회 (placeholder 제외)
  const { data: targets, error: queryErr } = await admin
    .from('profiles')
    .select('id')
    .lt('deleted_at', sevenDaysAgoIso)
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (queryErr) {
    console.error('[finalizeDeletions] query failed:', queryErr.message)
    return { finalized: 0, errors: 1 }
  }
  if (!targets || targets.length === 0) return { finalized: 0, errors: 0 }

  let finalized = 0
  let errors = 0
  for (const { id } of targets) {
    try {
      const { data, error } = await admin.rpc('finalize_account_deletion', { target_id: id })
      if (error) throw new Error(error.message)
      const r = data as { ok?: boolean; error?: string }
      if (r?.error) throw new Error(r.error)
      const { error: authErr } = await admin.auth.admin.deleteUser(id)
      if (authErr) throw new Error(`auth: ${authErr.message}`)
      finalized++
    } catch (e) {
      errors++
      console.error('[finalizeDeletions] failed for', id, e instanceof Error ? e.message : e)
    }
  }
  return { finalized, errors }
}
