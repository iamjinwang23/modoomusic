'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { ToastPayload, ToastType } from './toast'

const BADGE_BG: Record<ToastType, string> = {
  success: 'bg-teal-500',
  error:   'bg-red-500',
  info:    'bg-sky-500',
}

function VariantIcon({ type }: { type: ToastType }) {
  if (type === 'success') {
    return <Image src="/Check.svg" alt="" width={12} height={12} style={{ filter: 'invert(1)' }} />
  }
  if (type === 'error') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 3v6M8 11.5v.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 7.5v4.5M8 4.5v.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  toast: ToastPayload
  duration: number
  onDismiss: () => void
}

const SWIPE_DISMISS_THRESHOLD = 60  // px

export function ToastItem({ toast, duration, onDismiss }: Props) {
  const [entered, setEntered]   = useState(false)
  const [leaving, setLeaving]   = useState(false)
  const [dragY, setDragY]       = useState(0)
  const startYRef = useRef<number | null>(null)
  const remainingRef = useRef(duration)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef<number>(Date.now())

  // 진입 애니메이션
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // 자동 dismiss 타이머
  function startTimer() {
    if (timerRef.current) clearTimeout(timerRef.current)
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(triggerDismiss, remainingRef.current)
  }
  function pauseTimer() {
    if (!timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current))
  }

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function triggerDismiss() {
    if (leaving) return
    setLeaving(true)
    setTimeout(onDismiss, 200)
  }

  // ── 드래그/스와이프로 내리기 ─────────────────────────────────
  // 버튼(닫기/액션) 위에서 시작한 포인터는 드래그로 잡지 않음 — click 이벤트 살림
  function isInteractive(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('button, a')
  }
  function onPointerDown(e: React.PointerEvent) {
    if (leaving) return
    if (isInteractive(e.target)) return
    startYRef.current = e.clientY
    pauseTimer()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startYRef.current === null) return
    const dy = e.clientY - startYRef.current
    setDragY(Math.max(0, dy))  // 아래로만 끌리게
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startYRef.current === null) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    const dy = e.clientY - startYRef.current
    startYRef.current = null
    if (dy > SWIPE_DISMISS_THRESHOLD) {
      // 드래그한 만큼 더 내려가면서 사라짐
      setDragY(200)
      setLeaving(true)
      setTimeout(onDismiss, 200)
    } else {
      setDragY(0)
      startTimer()
    }
  }

  const isActive = entered && !leaving
  const translateY = leaving ? 24 + dragY : dragY
  const opacity = leaving ? 0 : isActive ? 1 : 0

  return (
    <div
      role="status"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { startYRef.current = null; setDragY(0); startTimer() }}
      style={{
        transform: `translateY(${translateY}px)`,
        opacity,
        transition: dragY === 0 || leaving ? 'transform 0.2s ease, opacity 0.2s ease' : 'none',
        touchAction: 'none',
      }}
      className="relative w-full bg-zinc-100 border border-zinc-300 rounded-xl shadow-2xl cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-start gap-3 pl-3.5 pr-2.5 py-3">
        {/* 컬러 뱃지 + 아이콘 */}
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${BADGE_BG[toast.type]}`}
          aria-hidden
        >
          <VariantIcon type={toast.type} />
        </span>
        <div className="flex-1 min-w-0 pt-px">
          <p className="text-sm font-medium text-zinc-900 leading-snug">{toast.message}</p>
          {toast.description && (
            <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{toast.description}</p>
          )}
        </div>
        {toast.action && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toast.action!.onClick(); triggerDismiss() }}
            className="shrink-0 text-xs font-semibold text-violet-600 hover:text-violet-700 px-2 py-1 rounded transition-colors"
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); triggerDismiss() }}
          title="닫기"
          className="shrink-0 w-6 h-6 rounded-full hover:bg-black/[0.06] flex items-center justify-center transition-colors text-zinc-500 hover:text-zinc-800"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
