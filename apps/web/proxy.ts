import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_ROUTE_PERMISSION: Record<string, string> = {
  '/admin/users':         'users',
  '/admin/content':       'content',
  '/admin/credits':       'credits',
  '/admin/reports':       'reports',
  '/admin/audit':         'audit',
  '/admin/announcements': 'announcements',
  '/admin/models':        'models',
}

function matchAdminRoute(pathname: string): string | null {
  for (const route of Object.keys(ADMIN_ROUTE_PERMISSION)) {
    if (pathname === route || pathname.startsWith(route + '/')) return route
  }
  return null
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 갱신 (반드시 await)
  const { data: { user } } = await supabase.auth.getUser()

  // Admin 라우트 가드 (Design Ref: admin §7 Security — URL 직접 입력 차단)
  const matchedRoute = matchAdminRoute(request.nextUrl.pathname)
  if (matchedRoute) {
    if (!user) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, admin_permissions')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile?.is_admin) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // admin_permissions가 NULL이면 최고관리자 → 전체 허용.
    const requiredPerm = ADMIN_ROUTE_PERMISSION[matchedRoute]
    const perms = profile.admin_permissions as string[] | null
    if (perms !== null && !perms.includes(requiredPerm)) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
