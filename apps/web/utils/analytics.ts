// Design Ref: analytics-ga4 §2 — Option C 중앙 wrapper
// env 미주입 시 모든 호출 no-op. 모든 호출 try/catch로 감싸 사용자 액션 차단 금지.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID

function isEnabled(): boolean {
  return Boolean(GA_ID) && typeof window !== 'undefined' && typeof window.gtag === 'function'
}

// Design Ref: §3.1 — 이벤트명 중앙 상수. typo 방지 + grep 1회 마이그레이션
export const EVENTS = {
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  SONG_GENERATE: 'song_generate',
  SONG_PUBLISH: 'song_publish',
  CREATOR_FOLLOW: 'creator_follow',
  RECOMMENDED_CREATOR_CLICK: 'recommended_creator_click',
  SONG_PLAY: 'song_play',
  SEARCH_PERFORM: 'search_perform',
  SEARCH_RESULT_CLICK: 'search_result_click',
  REFERRAL_SHARE: 'referral_share',
  REFERRAL_CLICK_IN: 'referral_click_in',
  REFERRAL_REDEEM_SUCCESS: 'referral_redeem_success',
  REFERRAL_ABUSE_BLOCKED: 'referral_abuse_blocked',
  ACCOUNT_DELETION_REQUEST: 'account_deletion_request',
  ACCOUNT_DELETION_RESTORED: 'account_deletion_restored',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

// Plan SC: 이벤트 발송 실패가 사용자 액션을 막지 않을 것
export function track(event: EventName, params: Record<string, unknown> = {}): void {
  if (!isEnabled()) return
  try {
    window.gtag!('event', event, params)
  } catch (e) {
    console.warn('[analytics.track]', event, e)
  }
}

// Plan SC: user_id = Supabase UUID만, PII 절대 금지
export function setUserId(userId: string): void {
  if (!isEnabled()) return
  try {
    window.gtag!('set', { user_id: userId })
  } catch (e) {
    console.warn('[analytics.setUserId]', e)
  }
}

export function clearUserId(): void {
  if (!isEnabled()) return
  try {
    window.gtag!('set', { user_id: null })
  } catch (e) {
    console.warn('[analytics.clearUserId]', e)
  }
}
