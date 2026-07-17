import { Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import * as AppleAuthentication from 'expo-apple-authentication'
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
  const frag = new URLSearchParams(url.hash.replace(/^#/, ''))

  // ⚠️ Supabase는 실패를 쿼리가 아니라 프래그먼트에 실어 보낼 때가 있다(#error=...).
  // 둘 다 보지 않으면 실패 원인이 통째로 사라지고 "code 없음"으로만 보인다.
  const authError = url.searchParams.get('error') ?? frag.get('error')
  if (authError) {
    const desc = url.searchParams.get('error_description') ?? frag.get('error_description')
    if (authError === 'access_denied' || /cancel/i.test(desc ?? '')) return { error: 'cancelled' }
    return { error: desc ?? authError }
  }

  const code = url.searchParams.get('code')
  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
    return exErr ? { error: exErr.message } : {}
  }
  // fragment 토큰 폴백(#access_token=...)
  const access_token = frag.get('access_token')
  const refresh_token = frag.get('refresh_token')
  if (access_token && refresh_token) {
    const { error: e } = await supabase.auth.setSession({ access_token, refresh_token })
    return e ? { error: e.message } : {}
  }
  return { error: 'no_code' }
}

// Apple — iOS에선 네이티브(AuthenticationServices)로. 웹 OAuth 왕복을 없애 기기별 편차를 제거한다.
// ⚠️ Supabase Apple provider의 Client IDs에 번들ID(com.modoomusic.app)가 등록돼 있어야 토큰 검증을 통과한다.
export async function signInWithAppleNative(): Promise<{ error?: string }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
    if (!credential.identityToken) return { error: 'Apple 인증 토큰을 받지 못했어요.' }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    })
    return error ? { error: error.message } : {}
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    // 취소는 실패가 아니다. 모듈은 RequestCanceledException(=ERR_REQUEST_CANCELED)을 던지지만
    // ⚠️ 그 code가 JS까지 실려오지 않는 경우가 있어(실측) 메시지로도 함께 판별한다.
    if (err?.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(err?.message ?? '')) {
      return { error: 'cancelled' }
    }
    return { error: err?.message ?? 'Apple 로그인에 실패했어요.' }
  }
}

// Apple 진입점 — iOS는 네이티브, 그 외(안드로이드)는 기존 웹 OAuth.
export async function signInWithApple(): Promise<{ error?: string }> {
  if (Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) {
    return signInWithAppleNative()
  }
  return signInWithProvider('apple')
}
