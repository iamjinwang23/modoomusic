import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// 관리자 권한 클라이언트 (RLS 무시) — 신뢰된 서버 로직에서만 사용
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

// 유저 세션 컨텍스트 클라이언트 (쿠키 기반 인증)
// auth.getUser() 등 현재 사용자 식별이 필요할 때 사용
export async function createUserClient() {
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
