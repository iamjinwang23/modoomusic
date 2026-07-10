import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

// 알림 미읽음 배지 전역 상태 — 벨 아이콘(여러 화면)에서 공유.
// 웹 NotificationRealtimeBridge 파리티: notifications 테이블 realtime 구독 → 미읽음 여부 갱신.
let unreadState = false
const listeners = new Set<(v: boolean) => void>()
let channel: RealtimeChannel | null = null
let currentUid: string | null = null

function emit(v: boolean) {
  if (v === unreadState) return
  unreadState = v
  listeners.forEach((l) => l(v))
}

async function refetch(uid: string) {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .is('read_at', null)
  emit((count ?? 0) > 0)
}

// 알림 읽음 처리 직후 즉시 배지 갱신용(realtime 지연 대비).
export function refreshUnreadNotifications() {
  if (currentUid) refetch(currentUid)
}

function ensureSubscription(uid: string) {
  if (currentUid === uid && channel) return
  if (channel) { supabase.removeChannel(channel); channel = null }
  currentUid = uid
  refetch(uid)
  channel = supabase
    .channel(`notif-badge:${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
      () => refetch(uid),
    )
    .subscribe()
}

export function useUnreadNotifications(): boolean {
  const [v, setV] = useState(unreadState)
  useEffect(() => {
    listeners.add(setV)
    setV(unreadState)
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id
      if (active && uid) ensureSubscription(uid)
    })
    return () => { active = false; listeners.delete(setV) }
  }, [])
  return v
}
