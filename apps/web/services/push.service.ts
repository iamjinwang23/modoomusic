// 웹 푸시 발송 (Web Push / VAPID). 알림 INSERT 지점에서 호출 → 앱 닫혀 있어도 푸시.
// env: NEXT_PUBLIC_VAPID_PUBLIC_KEY(클라용), VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:).
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

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

// 한 사용자의 모든 구독 기기로 푸시. 실패해도 throw 안 함.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return
  const admin = createAdminClient()
  const { data } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId)
  if (data && data.length) await sendToSubs(data as Sub[], payload)
}

// 전체 구독자에게 푸시 (공지 발행 등). 청크로 나눠 발송.
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return
  const admin = createAdminClient()
  const { data } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').limit(100000)
  if (!data || !data.length) return
  for (let i = 0; i < data.length; i += 500) {
    await sendToSubs(data.slice(i, i + 500) as Sub[], payload)
  }
}
