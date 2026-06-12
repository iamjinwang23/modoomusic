// Design Ref: admin §7 Security — 라우트 가드 (URL 직접 입력 차단).
// 사이드바 필터링은 UI 가림만 + 클라이언트 우회 가능 → 미들웨어로 서버사이드 차단.
// /admin/* 경로 진입 전 is_admin + admin_permissions 검증.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ROUTE_PERMISSION: Record<string, string> = {
  '/admin/users':         'users',
  '/admin/content':       'content',
  '/admin/credits':       'credits',
  '/admin/reports':       'reports',
  '/admin/audit':         'audit',
  '/admin/announcements': 'announcements',
  '/admin/models':        'models',
}

function matchRoute(pathname: string): string | null {
  for (const route of Object.keys(ROUTE_PERMISSION)) {
    if (pathname === route || pathname.startsWith(route + '/')) return route
  }
  return null
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // /admin 루트(대시보드)는 layout.tsx의 가드만 통과하면 OK.
  // /admin/{module} 진입만 권한 추가 체크.
  const matchedRoute = matchRoute(path)
  if (!matchedRoute) return NextResponse.next()

  const requiredPerm = ROUTE_PERMISSION[matchedRoute]

  // Supabase SSR client (middleware 컨텍스트)
  const res = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, admin_permissions')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // admin_permissions가 NULL이면 최고관리자 → 전체 허용.
  // 배열이면 해당 권한 포함 여부 확인.
  const perms = profile.admin_permissions as string[] | null
  if (perms !== null && !perms.includes(requiredPerm)) {
    // 권한 없으면 대시보드로 (admin 안에서)
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  return res
}

export const config = {
  matcher: '/admin/:path*',
}
