import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.NAVER_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/naver/callback`,
    state,
  })

  const res = NextResponse.redirect(`https://nid.naver.com/oauth2.0/authorize?${params}`)
  res.cookies.set('naver_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
  return res
}
