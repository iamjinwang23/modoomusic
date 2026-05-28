'use client'

import { useState, useRef } from 'react'
import { songService } from '@/services/song.service'
import { toast } from '@/components/toast/toast'
import type { Song } from '@/types/domain'
import type { GenerationStatus } from '../types/song'

// 백그라운드 생성 패턴 (Suno parity):
// 1) POST /api/generate → 서버가 status=generating row INSERT 후 즉시 반환
// 2) 캐시에 add → "내 음악"에 생성 중 row 표시
// 3) 완료 토스트·캐시 patch는 Supabase realtime이 담당 (RealtimeBridge)
export function useSongGeneration() {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<Song | null>(null)
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function generate(params: {
    prompt: string
    genre: string
    mood: string
    title: string
    customLyrics: string
    instrumental: boolean
    model: string
    audioBase64?: string
  }) {
    setStatus('generating')
    setError('')
    setResult(null)
    setElapsed(0)

    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'DAILY_LIMIT') {
          if (data.credits) window.dispatchEvent(new CustomEvent('credits-updated', { detail: data.credits }))
          if (data.credits?.remaining === 0) {
            window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'daily-limit' }))
          }
        } else if (data.code === 'MODEL_LOCKED') {
          window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'locked-model' }))
        }
        throw new Error(data.error)
      }
      if (data.credits) window.dispatchEvent(new CustomEvent('credits-updated', { detail: data.credits }))

      // 서버가 만든 generating row를 캐시에 추가 → "내 음악" 상단에 즉시 노출
      const song: Song = data.song
      songService.add(song)

      toast.info('곡을 만들고 있어요', { description: '완성되면 알려드릴게요' })

      setResult(song)
      setStatus('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      setError(msg)
      setStatus('error')
      if (!msg.includes('크레딧') && !msg.includes('Plus')) {
        toast.error('곡 생성에 실패했어요', { description: msg })
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  function reset() {
    setStatus('idle')
    setResult(null)
    setError('')
    setElapsed(0)
  }

  return { status, elapsed, result, error, generate, reset }
}
