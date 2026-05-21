'use client'

import { useState, useEffect } from 'react'
import { songService } from '@/services/song.service'
import type { Song } from '@/types/domain'

const COVER_HUES = [0, 30, 60, 120, 180, 210, 260, 300]

function baseHue(id: string) {
  return (id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
}

function previewGradient(hue: number) {
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

interface Props {
  song: Song
  onClose: () => void
}

export function SongEditModal({ song, onClose }: Props) {
  const [title, setTitle] = useState(song.title ?? '')
  const [hue, setHue] = useState(song.coverHue ?? baseHue(song.id))
  const [showPicker, setShowPicker] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  function handleSave() {
    songService.update(song.id, {
      title: title.trim() || null,
      coverHue: hue,
    })
    handleClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-280 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-[440px] bg-[#21252E] rounded-3xl overflow-hidden transition-all duration-280 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
        }}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>

        <div className="p-6 space-y-5">
          {/* Cover + Title */}
          <div className="flex gap-5 items-start">
            {/* Cover preview + 변경 버튼 */}
            <div className="flex flex-col items-center gap-3 shrink-0">
              <div
                className="w-28 h-28 rounded-2xl transition-all duration-300"
                style={{ background: previewGradient(hue) }}
              />
              <button
                type="button"
                onClick={() => setShowPicker(!showPicker)}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
                커버 변경
              </button>
            </div>

            {/* Title input */}
            <div className="flex-1 pt-1 space-y-1.5">
              <label className="text-xs text-zinc-500">제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목 없음"
                maxLength={80}
                autoFocus
                className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Color picker */}
          {showPicker && (
            <div className="flex gap-2.5 flex-wrap px-1">
              {COVER_HUES.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => { setHue(h); setShowPicker(false) }}
                  className={`w-9 h-9 rounded-full transition-transform hover:scale-110 ${
                    hue === h ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-[#21252E]' : ''
                  }`}
                  style={{ background: previewGradient(h) }}
                />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
