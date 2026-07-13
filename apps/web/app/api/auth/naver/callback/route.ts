import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// 앱(모바일) 진입 시 돌려보낼 딥링크 — openAuthSessionAsync가 이 스킴을 가로챈다.
const APP_CALLBACK = 'mono://auth/callback'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const storedState = request.cookies.get('naver_oauth_state')?.value
  const isApp = request.cookies.get('naver_oauth_platform')?.value === 'app'

  // 성공/실패 목적지 — 앱이면 딥링크, 웹이면 기존 경로. 쿠키 정리 포함.
  const bounce = (target: string) => {
    const res = isApp
      ? new NextResponse(null, { status: 302, headers: { Location: target } })
      : NextResponse.redirect(target)
    res.cookies.delete('naver_oauth_state')
    res.cookies.delete('naver_oauth_platform')
    return res
  }
  const fail = (reason: string) => bounce(isApp ? `${APP_CALLBACK}?error=${reason}` : origin)

  if (!code || !state || state !== storedState) {
    console.error('[naver/callback] state 불일치 또는 code 없음')
    return fail('state_mismatch')
  }

  // 1. 액세스 토큰 교환
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.NAVER_CLIENT_ID!,
    client_secret: process.env.NAVER_CLIENT_SECRET!,
    code,
    state,
  })
  const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${tokenParams}`)
  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    console.error('[naver/callback] 토큰 교환 실패:', tokenData)
    return fail('token_exchange')
  }

  // 2. 네이버 프로필 조회
  const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const profileData = await profileRes.json()
  const profile = profileData.response as {
    id: string
    email?: string
    name?: string
    nickname?: string
    profile_image?: string
  }

  if (!profile?.email) {
    console.error('[naver/callback] 이메일 없음:', profileData)
    return fail('no_email')
  }

  // 3. Supabase 매직링크 생성 — 신규 유저 자동 생성 + 기존 유저 세션 발급
  const admin = createAdminClient()
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
    options: {
      redirectTo: `${origin}/auth/callback`,
      data: {
        full_name: profile.name || profile.nickname || '네이버 사용자',
        avatar_url: profile.profile_image ?? null,
        provider: 'naver',
        naver_id: profile.id,
      },
    },
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[naver/callback] 매직링크 생성 실패:', linkError)
    return fail('link_failed')
  }

  const tokenHash = linkData.properties.hashed_token

  // 웹: 기존 콜백 페이지가 token_hash를 verifyOtp로 처리.
  if (!isApp) {
    return bounce(`${origin}/auth/callback?token_hash=${tokenHash}&type=magiclink`)
  }

  // 앱: 서버에서 OTP를 세션으로 교환해 토큰을 딥링크로 전달(앱은 setSession만).
  // 모바일 supabase 클라이언트는 flowType:'pkce'라 서버 생성 magiclink token_hash를 앱에서 직접 verifyOtp하면 실패 → 서버(비-PKCE)에서 교환.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (verifyError || !verified?.session) {
    console.error('[naver/callback] 앱 세션 교환 실패:', verifyError?.message)
    return fail('verify_failed')
  }
  const { access_token, refresh_token } = verified.session
  return bounce(`${APP_CALLBACK}?access_token=${access_token}&refresh_token=${refresh_token}`)
}
