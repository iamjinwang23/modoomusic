import { useSyncExternalStore } from 'react'
import { hapticNotify } from '@/lib/haptics'

// 앱 전역 스낵바 — 웹 components/toast/toast.ts와 동일 API(success/error/info + action).
// 사용: toast.success('컬렉션에 담았어요')  ·  toast.error('실패했어요', { action: { label: '다시', onPress: retry } })
export type ToastType = 'success' | 'error' | 'info'

export interface ToastAction { label: string; onPress: () => void }
export interface ToastOptions { description?: string; action?: ToastAction; duration?: number }
export interface ToastItem extends ToastOptions { id: number; type: ToastType; message: string }

export const TOAST_DURATION: Record<ToastType, number> = { success: 3000, info: 4000, error: 5000 }
// 타입별 등장 햅틱 (성공/경고/에러). 부수효과는 생성 시점 1회 — 여러 ToastHost가 렌더돼도 중복 안 됨.
const HAPTIC: Record<ToastType, 'success' | 'warning' | 'error'> = { success: 'success', info: 'warning', error: 'error' }

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()
function emit() { listeners.forEach((l) => l()) }

function push(type: ToastType, message: string, opts?: ToastOptions) {
  const id = ++seq
  items = [...items, { id, type, message, ...opts }].slice(-3)  // 최대 3개 스택
  emit()
  hapticNotify(HAPTIC[type])  // 등장 햅틱(1회)
  setTimeout(() => dismissToast(id), opts?.duration ?? TOAST_DURATION[type])  // 자동 닫힘(1회)
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

export const toast = {
  success: (message: string, opts?: ToastOptions) => push('success', message, opts),
  error: (message: string, opts?: ToastOptions) => push('error', message, opts),
  info: (message: string, opts?: ToastOptions) => push('info', message, opts),
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => items,
    () => items,
  )
}
