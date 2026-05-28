import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const storedState = request.cookies.get('naver_oauth_state')?.value

  // 임시 디버그: 실패 원인을 ?naver_error= 로 노출 (검수 통과 후 제거)
  const fail = (reason: string) => NextResponse.redirect(`${origin}/?naver_error=${encodeURIComponent(reason)}`)

  if (!code || !state || state !== storedState) {
    console.error('[naver/callback] state 불일치 또는 code 없음')
    return fail(`state_mismatch code=${!!code} state=${!!state} stored=${!!storedState}`)
  }

  // 1. 액세스 토큰 교환
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.NAVER_CLIENT_ID ?? '',
    client_secret: process.env.NAVER_CLIENT_SECRET ?? '',
    code,
    state,
  })
  const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${tokenParams}`)
  const tokenData = await tokenRes.json()

  if (!tokenData.access_token) {
    console.error('[naver/callback] 토큰 교환 실패:', tokenData)
    return fail(`token_exchange:${tokenData.error ?? 'no_token'}:${tokenData.error_description ?? ''}`)
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
    return fail(`generate_link:${linkError?.message ?? 'no_token'}`)
  }

  const res = NextResponse.redirect(
    `${origin}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=magiclink`
  )
  res.cookies.delete('naver_oauth_state')
  return res
}
