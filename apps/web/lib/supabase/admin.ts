// RLS 완전 우회 service-role 클라이언트. cookies 안 받음 → user JWT가 access_token으로
// 덮어쓰지 않음. 서버 라우트의 신뢰된 로직(트리거가 도는 INSERT/UPDATE, RLS INSERT 정책이
// 없는 notifications 등)에서만 사용. 절대 클라이언트 번들에 포함 X (서버 전용).
//
// 주의: lib/supabase/server.ts:createClient는 service_role 키를 쓰지만 cookies 옵션 때문에
// supabase-js가 user의 access_token이 있으면 그걸 사용 → RLS가 user 컨텍스트로 평가됨.
// 트리거 함수가 SECURITY DEFINER 없이 호출자 권한으로 실행되므로, 다른 사람의 songs/profiles
// UPDATE가 RLS로 차단됨 → like_count·follower_count 갱신 실패. notifications INSERT도 차단.
// 이 admin 클라이언트는 그런 케이스 전용.
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (cached) return cached
  cached = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  return cached
}
