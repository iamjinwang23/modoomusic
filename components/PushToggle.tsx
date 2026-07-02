// 웹 푸시 알림 켜기/끄기 — 내 계정. 권한 요청 → pushManager 구독 → 서버 저장.
'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/components/toast/toast'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export function PushToggle() {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC
    setSupported(ok)
    if (!ok) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {})
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { toast.error('알림 권한이 거부되어 있어요. 브라우저 설정에서 허용해 주세요'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC as string) as BufferSource,
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error('save failed')
      setEnabled(true)
      toast.success('푸시 알림을 켰어요')
    } catch {
      toast.error('푸시 알림 설정에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe()
      }
      setEnabled(false)
      toast.success('푸시 알림을 껐어요')
    } catch {
      toast.error('해제에 실패했어요')
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return null

  return (
    <button
      onClick={busy ? undefined : (enabled ? disable : enable)}
      disabled={busy}
      role="switch"
      aria-checked={enabled}
      aria-label="푸시 알림"
      className="w-full flex items-center justify-between px-4 py-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-sm text-white hover:bg-white/[0.05] transition disabled:opacity-60"
    >
      <span>푸시 알림</span>
      {/* iOS 스타일 토글 스위치 */}
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-white/[0.18]'} ${busy ? 'opacity-60' : ''}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
