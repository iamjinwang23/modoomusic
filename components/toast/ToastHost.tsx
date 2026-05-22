'use client'

import { useEffect, useState } from 'react'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { TOAST_DURATION, type ToastPayload } from './toast'
import { ToastItem } from './ToastItem'

interface Entry { id: number; payload: ToastPayload; duration: number }

const MAX_STACK = 3

export function ToastHost() {
  const [items, setItems] = useState<Entry[]>([])
  const { song } = useGlobalPlayer()
  const hasMiniBar = !!song

  useEffect(() => {
    let seq = 0
    function handler(e: Event) {
      const p = (e as CustomEvent<ToastPayload>).detail
      const duration = p.duration ?? TOAST_DURATION[p.type]
      setItems((prev) => {
        const next = [...prev, { id: ++seq, payload: p, duration }]
        return next.slice(-MAX_STACK)
      })
    }
    window.addEventListener('toast', handler)
    return () => window.removeEventListener('toast', handler)
  }, [])

  function dismiss(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  if (items.length === 0) return null

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[90] w-full max-w-[440px] px-4 flex flex-col gap-2 pointer-events-none"
      style={{ bottom: hasMiniBar ? 'calc(96px + env(safe-area-inset-bottom, 0px))' : 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
    >
      {items.map((it) => (
        <div key={it.id} className="pointer-events-auto">
          <ToastItem toast={it.payload} duration={it.duration} onDismiss={() => dismiss(it.id)} />
        </div>
      ))}
    </div>
  )
}
