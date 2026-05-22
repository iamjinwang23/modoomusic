'use client'

import { useState, useRef } from 'react'
import { songService } from '@/services/song.service'
import { startGeneration, endGeneration } from '@/services/generation.store'
import { toast } from '@/components/toast/toast'
import type { Song } from '@/types/domain'
import type { GenerationStatus } from '../types/song'

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
    const pendingInfo = { title: params.title.trim(), prompt: params.prompt, genre: params.genre, mood: params.mood, instrumental: params.instrumental }
    startGeneration(pendingInfo)
    window.dispatchEvent(new CustomEvent('song-generating', { detail: pendingInfo }))

    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const data = await res.json()
      if (!res.ok) {
        // 정책성 에러는 ComingSoonModal로 안내
        if (data.code === 'DAILY_LIMIT') {
          window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'daily-limit' }))
          if (data.credits) window.dispatchEvent(new CustomEvent('credits-updated', { detail: data.credits }))
        } else if (data.code === 'MODEL_LOCKED') {
          window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'locked-model' }))
        }
        throw new Error(data.error)
      }
      if (data.credits) window.dispatchEvent(new CustomEvent('credits-updated', { detail: data.credits }))

      const song = songService.save({
        title: params.title.trim() || null,
        prompt: params.prompt,
        genre: params.genre || null,
        mood: params.mood || null,
        customLyrics: params.customLyrics || null,
        instrumental: params.instrumental,
        lyrics: data.lyrics ?? null,
        audioUrl: data.audioUrl,
        coverImage: data.coverUrl ?? undefined,
        duration: null,
      })

      // 완료 토스트 — 다른 페이지에 있어도 알 수 있게. '들어보기' 누르면 즉시 재생
      toast.success('곡이 완성됐어요', {
        action: {
          label: '들어보기',
          onClick: () => {
            window.dispatchEvent(new CustomEvent('play-song', {
              detail: { feed: [song], idx: 0, isOwner: true, ownerAvatarUrl: null, ownerName: null },
            }))
          },
        },
      })

      setResult(song)
      setStatus('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      setError(msg)
      setStatus('error')
      // 정책 토스트(DAILY_LIMIT/MODEL_LOCKED)는 fetch 분기에서 별도 처리, 그 외만 일반 에러 토스트
      if (!msg.includes('크레딧') && !msg.includes('Plus')) {
        toast.error('곡 생성에 실패했어요', { description: msg })
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
      endGeneration()
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
