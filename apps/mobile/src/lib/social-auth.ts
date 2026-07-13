import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from './supabase'

// 웹 브라우저 인증 세션 완료 처리(리다이렉트 복귀)
WebBrowser.maybeCompleteAuthSession()

// 딥링크 리다이렉트 — app.json scheme "mono" → mono://auth/callback
// ⚠️ Supabase Dashboard > Auth > URL Configuration > Redirect URLs 에 이 값 등록 필요.
export const oauthRedirectTo = AuthSession.makeRedirectUri({ scheme: 'mono', path: 'auth/callback' })

export type SocialProvider = 'google' | 'kakao' | 'apple'

const WEB_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.modoonorae.com'

// 네이버 — Supabase 미지원이라 서버 커스텀 플로우(/api/auth/naver) 사용.
// 앱이면 서버 콜백이 mono://auth/callback?token_hash=... 로 돌려주고, 그 token_hash를 verifyOtp로 세션 교환.
export async function signInWithNaver(): Promise<{ error?: string }> {
  const res = await WebBrowser.openAuthSessionAsync(`${WEB_BASE}/api/auth/naver?platform=app`, oauthRedirectTo)
  if (res.type !== 'success' || !res.url) {
    return { error: res.type === 'cancel' || res.type === 'dismiss' ? 'cancelled' : 'failed' }
  }
  const url = new URL(res.url)
  const err = url.searchParams.get('error')
  if (err) return { error: err }

  // 서버가 세션을 교환해 access/refresh 토큰을 넘겨줌 → setSession만.
  const access_token = url.searchParams.get('access_token')
  const refresh_token = url.searchParams.get('refresh_token')
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    return error ? { error: error.message } : {}
  }

  // (하위호환) 구 배포가 token_hash로 넘겨줄 때 — PKCE에선 실패할 수 있음.
  const tokenHash = url.searchParams.get('token_hash')
  if (tokenHash && url.searchParams.get('type') === 'magiclink') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    return error ? { error: error.message } : {}
  }
  return { error: 'no_token' }
}

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
