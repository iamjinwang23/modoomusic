'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'

// AI 가사 생성 팝업 — 프롬프트 입력 → /api/lyrics → 구조 태그 가사 반환.
// 쿨다운 잔여 시간은 표시하지 않음(429는 토스트로만). Design Ref: ai-lyrics-gen §5.1
interface Props {
  open: boolean
  onClose: () => void
  onGenerated: (lyrics: string) => void
}

export function LyricsGenerateModal({ open, onClose, onGenerated }: Props) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null

  function handleClose() {
    if (loading) return
    setVisible(false)
    setTimeout(() => {
      setPrompt('')
      onClose()
    }, 280)
  }

  async function handleGenerate() {
    const p = prompt.trim()
    if (!p) {
      toast.error('프롬프트를 입력해 주세요')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? '가사를 만드는 중 문제가 생겼어요')
        return
      }
      onGenerated(data.lyrics ?? '')
      setVisible(false)
      setTimeout(() => {
        setPrompt('')
        onClose()
      }, 280)
    } catch {
      toast.error('가사를 만드는 중 문제가 생겼어요')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-280 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className="relative bg-[#21252E] border border-white/[0.10] rounded-t-2xl md:rounded-2xl w-full max-w-full md:max-w-[480px] max-h-[90vh] overflow-y-auto p-5 shadow-2xl transition-all duration-280 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Image src="/Ai-Generate-Text.svg" alt="" width={20} height={20} style={{ filter: 'invert(1)' }} />
            <p className="text-xl font-semibold text-white">AI 가사</p>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors"
          >
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        {/* 프롬프트 입력 */}
        <div className="space-y-2 mb-5">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`어떤 노래를 만들까요? 자유롭게 적어주세요\n예) 비 오는 날 헤어진 연인을 그리워하는 잔잔한 발라드`}
            disabled={loading}
            autoFocus
            className="w-full h-32 bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors resize-none leading-relaxed"
          />
          <p className="text-xs text-zinc-500">입력한 내용을 바탕으로 멋진 가사를 만들어드려요. 크레딧은 소모되지 않아요.</p>
        </div>

        {/* 생성 버튼 */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              만드는 중…
            </>
          ) : (
            <>
              <Image src="/Ai-Generate-Text.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
              가사 만들기
            </>
          )}
        </button>
      </div>
    </div>
  )
}
