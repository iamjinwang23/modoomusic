import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  // 모바일 앱에서 진입하면 콜백을 앱 딥링크로 돌려보내기 위해 플랫폼을 기록.
  const platform = searchParams.get('platform') === 'app' ? 'app' : 'web'
  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NAVER_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/naver/callback`,
    state,
  })

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 10,
    path: '/',
  }
  const res = NextResponse.redirect(`https://nid.naver.com/oauth2.0/authorize?${params}`)
  res.cookies.set('naver_oauth_state', state, cookieOpts)
  res.cookies.set('naver_oauth_platform', platform, cookieOpts)
  return res
}
