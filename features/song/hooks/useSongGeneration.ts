'use client'

import { useState, useRef } from 'react'
import { songService } from '@/services/song.service'
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
    window.dispatchEvent(new CustomEvent('song-generating', {
      detail: { title: params.title.trim(), prompt: params.prompt, genre: params.genre, mood: params.mood, instrumental: params.instrumental },
    }))

    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

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

      setResult(song)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
      setStatus('error')
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
