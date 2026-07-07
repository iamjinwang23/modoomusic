'use client'
// 미로그인 소프트 월 — 서로 다른 커뮤니티 상세 진입을 카운트, 3번째(새) 진입 시 로그인 월.
//  - 허브·같은 커뮤니티 재방문은 카운트 안 함 (본 커뮤니티 ID Set)
//  - 한도 초과 시 sticky 차단(blocked): 로그인/24h 리셋 전까지 재방문·새 진입 모두 월 (바운스 우회 차단)
//  - 24h 롤링 리셋 (하루 2개 무료, 3번째부터 월)
//  - 로그인 유저는 항상 false. localStorage 기반이라 크롤러(빈 저장소)엔 월 안 뜸.
import { useEffect, useState } from 'react'

const KEY = 'community_guest_views'
const WINDOW_MS = 24 * 60 * 60 * 1000
const FREE_LIMIT = 2 // 무료 2개 → 3번째 새 커뮤니티 진입 시 월

interface Store { ids: string[]; firstAt: number; blocked?: boolean }

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

    if (store.blocked) {
      // 한도 초과 후엔 sticky — 로그인(또는 24h 리셋) 전까지 재방문·새 진입 모두 월. 바운스 우회 차단.
      setWalled(true)
    } else {
      const seen = new Set(store.ids)
      if (seen.has(communityId)) {
        setWalled(false) // 한도 전 재방문 — 자유
      } else if (seen.size >= FREE_LIMIT) {
        store = { ...store, blocked: true } // 한도 도달 → sticky 차단 on
        setWalled(true)
      } else {
        seen.add(communityId)
        store = { ...store, ids: [...seen] }
        setWalled(false)
      }
    }
    try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* ignore */ }
  }, [communityId, isLoggedIn])
  return walled
}
