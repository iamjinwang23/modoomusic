import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from './supabase'

// 웹 브라우저 인증 세션 완료 처리(리다이렉트 복귀)
WebBrowser.maybeCompleteAuthSession()

// 딥링크 리다이렉트 — app.json scheme "mono" → mono://auth/callback
// ⚠️ Supabase Dashboard > Auth > URL Configuration > Redirect URLs 에 이 값 등록 필요.
export const oauthRedirectTo = AuthSession.makeRedirectUri({ scheme: 'mono', path: 'auth/callback' })

export type SocialProvider = 'google' | 'kakao' | 'apple'

// Supabase OAuth(PKCE) — 인증 URL을 인앱 브라우저로 열고, 복귀 URL의 code를 세션으로 교환.
export async function signInWithProvider(provider: SocialProvider): Promise<{ error?: string }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: oauthRedirectTo, skipBrowserRedirect: true },
  })
  if (error) return { error: error.message }
  if (!data?.url) return { error: 'no_auth_url' }

  const res = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo)
  if (res.type !== 'success' || !res.url) {
    return { error: res.type === 'cancel' || res.type === 'dismiss' ? 'cancelled' : 'failed' }
  }

  const url = new URL(res.url)
  const code = url.searchParams.get('code')
  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
    return exErr ? { error: exErr.message } : {}
  }
  // fragment 토큰 폴백(#access_token=...)
  const frag = new URLSearchParams(url.hash.replace(/^#/, ''))
  const access_token = frag.get('access_token')
  const refresh_token = frag.get('refresh_token')
  if (access_token && refresh_token) {
    const { error: e } = await supabase.auth.setSession({ access_token, refresh_token })
    return e ? { error: e.message } : {}
  }
  return { error: 'no_code' }
}
