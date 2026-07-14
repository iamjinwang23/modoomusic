import { useCallback } from 'react'
import { router } from 'expo-router'
import { useSession } from '@/lib/use-session'

// 앱 전역 인증 게이트 — 게스트는 감상·공개 조회 자유, 로그인 필요한 상호작용 앞에서 requireAuth() 호출.
// 로그인 시트는 `/login`(transparentModal 라우트) — 플레이어 등 다른 모달 위로도 스택으로 올라온다.
export function useAuthGate() {
  const { session } = useSession()
  const requireAuth = useCallback(() => {
    if (session) return true
    router.push('/login')
    return false
  }, [session])
  return { requireAuth }
}
