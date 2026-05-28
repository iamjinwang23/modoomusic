'use client'

// 백그라운드 생성 패턴 (Suno parity):
// 서버 API가 status=generating으로 INSERT 후 백그라운드에서 MiniMax→Storage→UPDATE.
// 이 컴포넌트는 본인 user_id의 songs UPDATE 이벤트를 구독해
// generating → done/failed 전환 시 캐시 patch + 완료 토스트를 띄움.

import { useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import { songService } from '@/services/song.service'
import { toast } from '@/components/toast/toast'
import type { Song } from '@/types/domain'

interface SongRow {
  id: string
  status: 'generating' | 'done' | 'failed' | null
  audio_url: string | null
  cover_image: string | null
  lyrics: string | null
  duration: number | null
  title: string | null
}

function rowToPatch(r: SongRow): Partial<Song> {
  return {
    status: r.status ?? 'done',
    audioUrl: r.audio_url ?? '',
    coverImage: r.cover_image ?? undefined,
    lyrics: r.lyrics,
    duration: r.duration,
  }
}

export function SongRealtimeBridge() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase
      .channel(`songs:user:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'songs', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as SongRow
          const prev = payload.old as Partial<SongRow>
          if (!next?.id) return

          songService.applyRowPatch(next.id, rowToPatch(next))

          // 상태 전환만 토스트로 알림 (status 외 단순 patch는 무시)
          if (prev?.status === 'generating' && next.status === 'done') {
            const label = next.title?.trim() || '새 곡'
            toast.success('곡이 완성됐어요', { description: label })
            // notifications 리프레시 (서버가 song_complete INSERT 했음)
            window.dispatchEvent(new Event('notifications-changed'))
          } else if (prev?.status === 'generating' && next.status === 'failed') {
            toast.error('곡 생성에 실패했어요', { description: '크레딧이 자동으로 환불되었어요' })
            // 환불됐으니 credits 리프레시
            fetch('/api/credits/me')
              .then((r) => r.json())
              .then((d) => window.dispatchEvent(new CustomEvent('credits-updated', { detail: d })))
              .catch(() => {})
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  return null
}
