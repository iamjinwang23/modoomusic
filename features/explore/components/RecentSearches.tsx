'use client'

// Design Ref: search §5.4 — 최근 검색어 드롭다운 (Spotify 패턴)
// 검색창 바로 아래에 vertical row 리스트로 노출. localStorage 10 FIFO.

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'mono.search.recent'
const MAX_RECENT = 10

function loadRecents(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveRecents(list: string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 무시
  }
}

// Plan SC FR-09: 검색 수행 시 호출. ExplorePanel에서 import 후 사용
export function addRecentSearch(q: string): void {
  const trimmed = q.trim()
  if (!trimmed) return
  const current = loadRecents()
  const next = [trimmed, ...current.filter((x) => x !== trimmed)].slice(0, MAX_RECENT)
  saveRecents(next)
  window.dispatchEvent(new Event('search-recents-changed'))
}

export function RecentSearches({ onSelect }: { onSelect: (q: string) => void }) {
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    setRecents(loadRecents())
    function onChange() { setRecents(loadRecents()) }
    window.addEventListener('search-recents-changed', onChange)
    return () => window.removeEventListener('search-recents-changed', onChange)
  }, [])

  function remove(q: string, e: React.MouseEvent) {
    e.stopPropagation()
    const next = recents.filter((r) => r !== q)
    setRecents(next)
    saveRecents(next)
  }

  function clearAll() {
    setRecents([])
    saveRecents([])
  }

  if (recents.length === 0) return null

  return (
    <div className="rounded-2xl bg-[#1e2128] border border-white/[0.08] shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <p className="text-xs font-semibold text-zinc-400">최근 검색</p>
        <button
          onClick={clearAll}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          모두 지우기
        </button>
      </div>
      <ul className="max-h-[360px] overflow-y-auto py-1">
        {recents.map((q) => (
          <li key={q}>
            <div
              onClick={() => onSelect(q)}
              className="group flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              {/* 시계 회전 아이콘 — Refresh.svg 회전 stub. 인라인 SVG가 깔끔 */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
                <path d="M12 8v4l3 2" />
                <path d="M3.05 11a9 9 0 1 1 .5 4" />
                <path d="M3 4v5h5" />
              </svg>
              <span className="flex-1 text-sm text-zinc-200 truncate">{q}</span>
              <button
                type="button"
                onClick={(e) => remove(q, e)}
                aria-label="삭제"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-white/[0.08] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
