import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const oauthError = searchParams.get('error')
  const oauthErrorDesc = searchParams.get('error_description')

  if (oauthError) {
    console.error('[auth/callback] OAuth 에러:', oauthError, oauthErrorDesc)
    return NextResponse.redirect(origin)
  }

  const redirectResponse = NextResponse.redirect(origin)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Naver OAuth — OTP token_hash 기반 세션 교환
  if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'magiclink' | 'email',
    })
    if (error) {
      console.error('[auth/callback] verifyOtp 실패:', error.message)
      return NextResponse.redirect(origin)
    }
    console.log('[auth/callback] Naver 세션 교환 성공. user:', data.session?.user?.email)
    return redirectResponse
  }

  if (!code) {
    console.error('[auth/callback] code 파라미터 없음. URL:', request.url)
    return NextResponse.redirect(origin)
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession 실패:', error.message, error.status)
    return NextResponse.redirect(origin)
  }

  console.log('[auth/callback] 세션 교환 성공. user:', data.session?.user?.email)
  return redirectResponse
}
