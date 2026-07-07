'use client'
// 미로그인 소프트 월 — 서로 다른 커뮤니티 상세 진입을 카운트, 3번째(새) 진입 시 로그인 월.
//  - 허브·같은 커뮤니티 재방문은 카운트 안 함 (본 커뮤니티 ID Set)
//  - 24h 롤링 리셋 (하루 2개 무료, 3번째부터 월)
//  - 로그인 유저는 항상 false. localStorage 기반이라 크롤러(빈 저장소)엔 월 안 뜸.
import { useEffect, useState } from 'react'

const KEY = 'community_guest_views'
const WINDOW_MS = 24 * 60 * 60 * 1000
const FREE_LIMIT = 2 // 무료 2개 → 3번째 새 커뮤니티 진입 시 월

interface Store { ids: string[]; firstAt: number }

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Store
      if (p && Array.isArray(p.ids) && typeof p.firstAt === 'number') return p
    }
  } catch { /* ignore */ }
  return { ids: [], firstAt: Date.now() }
}

export function useGuestCommunityWall(communityId: string | undefined, isLoggedIn: boolean): boolean {
  const [walled, setWalled] = useState(false)
  useEffect(() => {
    if (isLoggedIn || !communityId) { setWalled(false); return }
    let store = readStore()
    if (Date.now() - store.firstAt > WINDOW_MS) store = { ids: [], firstAt: Date.now() } // 24h 롤링 리셋

    const seen = new Set(store.ids)
    if (seen.has(communityId)) {
      setWalled(false) // 이미 본 커뮤니티 — 자유
    } else if (seen.size >= FREE_LIMIT) {
      setWalled(true) // 새 커뮤니티인데 무료 한도 소진 → 월 (카운트에 추가하지 않음)
    } else {
      seen.add(communityId)
      store = { ids: [...seen], firstAt: store.firstAt }
      setWalled(false)
    }
    try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* ignore */ }
  }, [communityId, isLoggedIn])
  return walled
}
