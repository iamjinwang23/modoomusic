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
import type { Song } from '@mono/shared'

interface SongRow {
  id: string
  status: 'generating' | 'done' | 'failed' | null
  audio_url: string | null
  cover_image: string | null
  lyrics: string | null
  duration: number | null
  title: string | null
  prompt: string | null
  video_cover_status?: 'generating' | 'done' | 'failed' | null
  video_cover_url?: string | null
}

function rowToPatch(r: SongRow): Partial<Song> {
  const patch: Partial<Song> = {
    status: r.status ?? 'done',
    audioUrl: r.audio_url ?? '',
    coverImage: r.cover_image ?? undefined,
    lyrics: r.lyrics,
    duration: r.duration,
    title: r.title,  // 심플 모드 자동 제목(song_title)이 완료 시 채워짐 → 캐시 반영
  }
  // 심플 모드는 완료 시 prompt(스타일)를 style_tags로 교체 → 캐시 반영
  if (r.prompt != null) patch.prompt = r.prompt
  // 비디오 커버 상태/URL
  if (r.video_cover_status !== undefined) patch.videoCoverStatus = r.video_cover_status ?? undefined
  if (r.video_cover_url !== undefined) patch.videoCoverUrl = r.video_cover_url ?? undefined
  return patch
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
          if (!next?.id) return

          // REPLICA IDENTITY DEFAULT에선 payload.old에 PK만 들어와 status 비교 불가.
          // 캐시의 이전 status를 ground truth로 사용 (없으면 신규 row로 간주).
          const cached = songService.getById(next.id)
          const prevStatus = cached?.status ?? null
          const prevVideoStatus = cached?.videoCoverStatus ?? null

          songService.applyRowPatch(next.id, rowToPatch(next))

          // 비디오 커버 완료/실패 토스트 (음악과 분리)
          if (prevVideoStatus === 'generating' && next.video_cover_status === 'done') {
            toast.success('영상이 완성됐어요', { description: next.title?.trim() || '새 곡' })
            window.dispatchEvent(new Event('notifications-changed'))
          } else if (prevVideoStatus === 'generating' && next.video_cover_status === 'failed') {
            toast.error('영상 생성에 실패했어요', { description: '체험권·크레딧이 자동 환불되었어요' })
            window.dispatchEvent(new Event('notifications-changed'))
          }

          if (prevStatus === 'generating' && next.status === 'done') {
            const label = next.title?.trim() || '새 곡'
            toast.success('곡이 완성됐어요', { description: label })
            window.dispatchEvent(new Event('notifications-changed'))
          } else if (prevStatus === 'generating' && next.status === 'failed') {
            toast.error('곡 생성에 실패했어요', { description: '크레딧이 자동으로 환불되었어요' })
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
