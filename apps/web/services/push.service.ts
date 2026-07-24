// 웹 푸시 발송 (Web Push / VAPID). 알림 INSERT 지점에서 호출 → 앱 닫혀 있어도 푸시.
// env: NEXT_PUBLIC_VAPID_PUBLIC_KEY(클라용), VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:).
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PushCategory } from '@mono/shared'

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:bee202408@gmail.com', pub, priv)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
  data?: Record<string, string>  // Expo 딥링크용 — { route: '/(tabs)' } 등
}

interface Sub { endpoint: string; p256dh: string; auth: string }

// 구독 배열에 동일 payload 발송. 만료(404/410) 구독은 자동 삭제.
async function sendToSubs(subs: Sub[], payload: PushPayload): Promise<void> {
  const admin = createAdminClient()
  const body = JSON.stringify(payload)
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      } else {
        console.error('[push] send 실패:', (e as Error).message)
      }
    }
  }))
}

// Expo Push API로 발송. 만료(DeviceNotRegistered) 토큰 자동 삭제. throw 안 함.
async function sendToExpo(tokens: string[], payload: PushPayload): Promise<void> {
  const admin = createAdminClient()
  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body ?? '',
    sound: 'default' as const,
    data: payload.data ?? {},
  }))
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      })
      const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> }
      const results = json.data ?? []
      await Promise.all(results.map(async (r, idx) => {
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
          await admin.from('push_subscriptions').delete().eq('endpoint', chunk[idx].to)
        }
      }))
    } catch (e) {
      console.error('[push] expo send 실패:', (e as Error).message)
    }
  }
}

// 한 사용자의 모든 구독 기기(web+expo)로 푸시. category 지정 시 프리퍼런스로 게이팅. 실패해도 throw 안 함.
export async function sendPushToUser(userId: string, payload: PushPayload, category?: PushCategory): Promise<void> {
  // ensureConfigured()는 web-push(VAPID) 전용 — expo 채널은 VAPID 불필요하므로 여기서 조기 return 안 함.
  const admin = createAdminClient()

  // 전체 알림 마스터(push_enabled) + 카테고리 게이팅. 프리퍼런스 행이 있고 false면 skip(opt-out).
  {
    const cols = category ? `push_enabled, ${category}` : 'push_enabled'
    const { data: pref } = await admin
      .from('notification_preferences')
      .select(cols)
      .eq('user_id', userId)
      .maybeSingle()
    if (pref) {
      const p = pref as unknown as Record<string, boolean>
      if (p.push_enabled === false) return  // 마스터 off → 전체 차단
      if (category && p[category] === false) return
    }
  }

  const { data } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, platform')
    .eq('user_id', userId)
  if (!data || !data.length) return

  const webSubs = data.filter((s) => s.platform !== 'expo' && s.p256dh && s.auth) as Sub[]
  const expoTokens = data.filter((s) => s.platform === 'expo').map((s) => s.endpoint as string)

  if (webSubs.length && ensureConfigured()) await sendToSubs(webSubs, payload)
  if (expoTokens.length) await sendToExpo(expoTokens, payload)
}

// 전체 구독자에게 푸시 (공지 발행 등). 청크로 나눠 발송. web/expo 채널 병행.
// category 지정 시 마스터(push_enabled) off 또는 해당 카테고리 off인 유저는 제외(프리퍼런스 행 없으면 기본 수신).
export async function sendPushToAll(payload: PushPayload, category?: PushCategory): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth, platform, user_id').limit(100000)
  if (!data || !data.length) return
  const excluded = new Set<string>()
  {
    const filter = category ? `push_enabled.eq.false,${category}.eq.false` : 'push_enabled.eq.false'
    const { data: prefs } = await admin.from('notification_preferences').select('user_id').or(filter)
    for (const p of prefs ?? []) excluded.add((p as { user_id: string }).user_id)
  }
  const active = data.filter((s) => !excluded.has((s as { user_id: string | null }).user_id ?? ''))
  const webSubs = active.filter((s) => s.platform !== 'expo' && s.p256dh && s.auth) as Sub[]
  const expoTokens = active.filter((s) => s.platform === 'expo').map((s) => s.endpoint as string)
  if (ensureConfigured()) {
    for (let i = 0; i < webSubs.length; i += 500) await sendToSubs(webSubs.slice(i, i + 500), payload)
  }
  for (let i = 0; i < expoTokens.length; i += 100) await sendToExpo(expoTokens.slice(i, i + 100), payload)
}
