// Design Ref: social-actions §5.1 — 좋아요·팔로우 토글 통일 헬퍼
// 낙관적 UI + 실패 시 롤백 + inflight 중복 클릭 차단 + 비로그인 가드
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export interface OptimisticToggleResult<T = unknown> {
  state: boolean
  count: number
  toggle: () => Promise<void>
}

interface Options {
  initialState: boolean
  initialCount: number
  /** 토글 동작 — 서버 호출. 성공 시 state(+count) 반환 */
  fetcher: () => Promise<{ state: boolean; count?: number }>
  /** 호출 전 가드 — false 반환하면 fetch 안 함 (비로그인 등) */
  guard?: () => boolean
  /** 실패 토스트 등 */
  onError?: (e: Error) => void
}

export function useOptimisticToggle({
  initialState,
  initialCount,
  fetcher,
  guard,
  onError,
}: Options): OptimisticToggleResult {
  const [state, setState] = useState(initialState)
  const [count, setCount] = useState(initialCount)
  const pending = useRef(false)

  // prop이 바뀌면 (예: 곡 데이터 갱신) 동기화
  useEffect(() => { setState(initialState) }, [initialState])
  useEffect(() => { setCount(initialCount) }, [initialCount])

  const toggle = useCallback(async () => {
    if (pending.current) return                    // inflight 중복 차단
    if (guard && !guard()) return                  // 비로그인 등 — guard 측에서 처리

    pending.current = true
    const prevState = state
    const prevCount = count
    const nextState = !prevState
    setState(nextState)
    setCount((c) => c + (nextState ? 1 : -1))

    try {
      const res = await fetcher()
      setState(res.state)
      if (typeof res.count === 'number') setCount(res.count)
    } catch (e) {
      setState(prevState)
      setCount(prevCount)
      onError?.(e instanceof Error ? e : new Error(String(e)))
    } finally {
      pending.current = false
    }
  }, [state, count, fetcher, guard, onError])

  return { state, count, toggle }
}
