'use client'
// 글 첨부 이미지 — 캐러셀(화살표+도트+카운트) + 클릭 시 라이트박스(확대/닫기·좌우 이동·Esc)
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

function Arrow({ dir, onClick, className = '' }: { dir: 'left' | 'right'; onClick: (e: React.MouseEvent) => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition active:scale-90 ${className}`}
      aria-label={dir === 'left' ? '이전' : '다음'}>
      <svg width="9" height="14" viewBox="0 0 9 14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === 'right' ? 'scaleX(-1)' : undefined }}>
        <path d="M8 1L2 7l6 6" />
      </svg>
    </button>
  )
}

export function PostImageGallery({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const total = images.length
  const cur = Math.min(idx, total - 1)

  const go = useCallback((d: number) => setIdx((i) => (i + d + total) % total), [total])

  useEffect(() => {
    if (!lightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(false)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, go])

  if (total === 0) return null

  return (
    <>
      <div className="mt-2.5 relative rounded-xl overflow-hidden bg-black/40 border border-white/[0.06]">
        <div className="w-full aspect-[4/3] flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setLightbox(true) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[cur]} alt="" className="max-w-full max-h-full object-contain cursor-zoom-in" />
        </div>
        {total > 1 && (
          <>
            <Arrow dir="left" onClick={(e) => { e.stopPropagation(); go(-1) }} className="absolute left-2 top-1/2 -translate-y-1/2" />
            <Arrow dir="right" onClick={(e) => { e.stopPropagation(); go(1) }} className="absolute right-2 top-1/2 -translate-y-1/2" />
            <span className="absolute top-2 right-2 text-[11px] font-medium text-white bg-black/50 px-2 py-0.5 rounded-full tabular-nums">{cur + 1}/{total}</span>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === cur ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {lightbox && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90" onClick={() => setLightbox(false)}>
          <button type="button" onClick={() => setLightbox(false)} aria-label="닫기"
            className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[cur]} alt="" className="max-w-[92vw] max-h-[88vh] object-contain" onClick={(e) => e.stopPropagation()} />
          {total > 1 && (
            <>
              <Arrow dir="left" onClick={(e) => { e.stopPropagation(); go(-1) }} className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 !w-11 !h-11" />
              <Arrow dir="right" onClick={(e) => { e.stopPropagation(); go(1) }} className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 !w-11 !h-11" />
              <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-sm text-white bg-white/10 px-3 py-1 rounded-full tabular-nums">{cur + 1} / {total}</span>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
