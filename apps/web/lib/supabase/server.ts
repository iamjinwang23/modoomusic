import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { resolveAuthToken } from '@mono/shared'

// ⚠️ DEPRECATED — 이름과 달리 cookies를 받기 때문에 user JWT가 우선 적용되어
// RLS가 user 컨텍스트로 평가됨. 진짜 admin 권한이 필요하면 `lib/supabase/admin.ts`의
// `createAdminClient()`를 사용. 새 코드는 이 함수 호출하지 말 것.
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 서버 컴포넌트에서 호출 시 무시 (미들웨어가 처리)
          }
        },
      },
    }
  )
}

// 유저 세션 컨텍스트 클라이언트 — 웹은 쿠키, RN 앱은 Authorization: Bearer 토큰.
// auth.getUser() 등 현재 사용자 식별이 필요할 때 사용.
export async function createUserClient() {
  // RN 앱 경로: Bearer 토큰이 있으면 헤더로 세션 주입(쿠키 미사용). 없으면 기존 쿠키 경로.
  const token = resolveAuthToken(await headers())
  if (token) {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        cookies: { getAll() { return [] }, setAll() {} },
      }
    )
  }
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 무시
          }
        },
      },
    }
  )
}
