'use client'

// Design Ref: video-cover §4 — 비디오 자동 폴링 재개 (이탈/서버재시작 회수)
// 로그인 사용자의 generating 비디오를 8초마다 점검 → video-status 호출로 서버가 마무리.
// 모달이 닫혀 있어도(또는 앱 재진입 시) 진행중 영상을 완료/실패로 수렴시킴.
import { useEffect, useRef } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { songService } from '@/services/song.service'

export function VideoCoverPoller() {
  const { user } = useAuth()
  const inflight = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const tick = async () => {
      const generating = songService.getAll().filter((s) => s.videoCoverStatus === 'generating')
      for (const s of generating) {
        if (inflight.current.has(s.id)) continue
        inflight.current.add(s.id)
        try {
          const res = await fetch(`/api/songs/${s.id}/video-status`)
          const d = await res.json()
          if (!cancelled && (d.status === 'done' || d.status === 'failed')) {
            songService.applyRowPatch(s.id, { videoCoverStatus: d.status, videoCoverUrl: d.videoCoverUrl ?? undefined })
          }
        } catch { /* 다음 틱에서 재시도 */ }
        finally { inflight.current.delete(s.id) }
      }
    }

    tick()
    const iv = setInterval(tick, 8000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [user])

  return null
}
