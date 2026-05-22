// 곡 생성 진행 상태를 페이지 이동에도 살아남게 보관하는 모듈 싱글톤
// 새로 마운트되는 컴포넌트는 getPending() / getStartedAt()로 현재 상태를 즉시 조회 가능
// 변경 시 'generation-state' 이벤트가 발행됨

export interface PendingInfo {
  title: string
  prompt: string
  genre: string
  mood: string
  instrumental: boolean
}

let current: PendingInfo | null = null
let startedAt: number | null = null

function notify() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('generation-state'))
}

export function startGeneration(info: PendingInfo) {
  current = info
  startedAt = Date.now()
  notify()
}

export function endGeneration() {
  current = null
  startedAt = null
  notify()
}

export function getPending(): PendingInfo | null {
  return current
}

export function getElapsedSeconds(): number {
  if (!startedAt) return 0
  return Math.floor((Date.now() - startedAt) / 1000)
}
