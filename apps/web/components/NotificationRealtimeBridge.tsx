'use client'

// 알림 INSERT realtime 구독 → 즉시 unread 배지 갱신.
// SongRealtimeBridge의 'notifications-changed' 이벤트는 race condition (songs UPDATE가
// 알림 INSERT보다 먼저 실행됨 → unreadCount fetch 시점에 row 없음) + cache prevStatus
// 가드의 취약성(새로고침 시 false negative)이 있어 보조용일 뿐.
// 본 컴포넌트가 알림 자체 채널을 구독해 누락 없이 배지 갱신.

import { useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'

export function NotificationRealtimeBridge() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:user:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          window.dispatchEvent(new Event('notifications-changed'))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  return null
}
