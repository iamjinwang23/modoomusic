// 글로벌 토스트 헬퍼 — 이벤트 버스 기반
// 사용: toast.success('회원가입이 완료되었어요')
//       toast.error('연결에 문제가 생겼어요', { action: { label: '다시 시도', onClick: retry } })

export type ToastType = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  description?: string
  action?: ToastAction
  duration?: number  // ms, 생략 시 type 기본값
}

export interface ToastPayload extends ToastOptions {
  type: ToastType
  message: string
}

function dispatch(type: ToastType, message: string, opts?: ToastOptions) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ToastPayload>('toast', {
    detail: { type, message, ...opts },
  }))
}

export const toast = {
  success: (message: string, opts?: ToastOptions) => dispatch('success', message, opts),
  error:   (message: string, opts?: ToastOptions) => dispatch('error',   message, opts),
  info:    (message: string, opts?: ToastOptions) => dispatch('info',    message, opts),
}

export const TOAST_DURATION: Record<ToastType, number> = {
  success: 3000,
  info:    4000,
  error:   5000,
}
