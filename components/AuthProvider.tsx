'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { setSongOwner } from '@/services/song.service'
import { setCollectionOwner } from '@/services/collection.service'
import { toast } from '@/components/toast/toast'
import { track, setUserId, clearUserId, EVENTS } from '@/utils/analytics'

export interface AuthProfile {
  username: string
  displayName: string | null
  avatarUrl: string | null
  avatarHue: number
  onboardingDone: boolean
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  profile: AuthProfile | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  profile: null,
  refreshProfile: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<AuthProfile | null>(null)

  const refreshProfile = useCallback(async () => {
    if (!user) { setProfile(null); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, avatar_url, avatar_hue, onboarding_done')
      .eq('id', user.id)
      .maybeSingle()
    if (!data) { setProfile(null); return }
    setProfile({
      username: data.username,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      avatarHue: data.avatar_hue ?? 0,
      onboardingDone: !!data.onboarding_done,
    })
  }, [user])

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      setSongOwner(u?.id ?? null)
      setCollectionOwner(u?.id ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      setSongOwner(u?.id ?? null)
      setCollectionOwner(u?.id ?? null)

      // Design Ref: §7.4 — GA4 user_id sync + sign_up/login 이벤트
      if (event === 'SIGNED_IN' && u) {
        const provider = (u.app_metadata?.provider as string) || 'unknown'
        // 신규 가입 판별: created_at 이 60초 이내면 sign_up
        const createdAt = u.created_at ? new Date(u.created_at).getTime() : 0
        const isNewUser = createdAt > 0 && Date.now() - createdAt < 60_000
        if (isNewUser) {
          track(EVENTS.SIGN_UP, { provider })
        } else {
          track(EVENTS.LOGIN, { provider })
        }

        // Design Ref: referral §7.3 + Decision #11 — isNewUser 60s 가드, 기존 회원 차단
        const refCode = (typeof window !== 'undefined') ? sessionStorage.getItem('mono.referral.code') : null
        if (refCode && isNewUser) {
          fetch('/api/referral/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: refCode }),
          }).then(r => r.json()).then(d => {
            sessionStorage.removeItem('mono.referral.code')
            if (d.data?.bonus_credits) {
              toast.success(`친구 초대 보너스 ${d.data.bonus_credits}크레딧 받았어요!`)
              track(EVENTS.REFERRAL_REDEEM_SUCCESS, { invitee_bonus: d.data.bonus_credits })
            } else if (d.error === 'abuse_blocked') {
              track(EVENTS.REFERRAL_ABUSE_BLOCKED, { reason: d.reason })
            }
          }).catch((e) => {
            console.warn('[referral.redeem] failed:', e)
            sessionStorage.removeItem('mono.referral.code')
          })
        } else if (refCode && !isNewUser) {
          // 기존 회원이 referral 링크로 로그인 — 보너스 무효, 정리만
          sessionStorage.removeItem('mono.referral.code')
        }
      } else if (event === 'SIGNED_OUT') {
        clearUserId()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Design Ref: referral §7.1 — `?ref=` 쿼리 sessionStorage 보존 (OAuth callback까지)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const ref = url.searchParams.get('ref')
    if (ref && /^[a-z0-9]{8}$/.test(ref)) {
      sessionStorage.setItem('mono.referral.code', ref)
      track(EVENTS.REFERRAL_CLICK_IN, { code: ref })
      // URL 정리 (사용자 UX)
      url.searchParams.delete('ref')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // 유저 바뀌면 프로필 1회 fetch + GA4 user_id sync
  useEffect(() => {
    refreshProfile()
    // Design Ref: §7.4 — auth 변경 단일 진입점에서 user_id sync (Plan SC: cross-device retention)
    if (user?.id) setUserId(user.id)
    else clearUserId()
  }, [user?.id, refreshProfile])

  // 부분 갱신 이벤트 — fetch 안 하고 로컬 패치
  useEffect(() => {
    function onAvatar(e: Event) {
      const url = (e as CustomEvent<string | null>).detail
      setProfile((p) => p ? { ...p, avatarUrl: url } : p)
    }
    function onProfile(e: Event) {
      const d = (e as CustomEvent<{ username: string; displayName: string }>).detail
      setProfile((p) => p ? { ...p, username: d.username, displayName: d.displayName } : p)
    }
    window.addEventListener('profile-avatar-updated', onAvatar)
    window.addEventListener('profile-updated', onProfile)
    return () => {
      window.removeEventListener('profile-avatar-updated', onAvatar)
      window.removeEventListener('profile-updated', onProfile)
    }
  }, [])

  async function signOut() {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('로그아웃 중 오류가 발생했어요')
      return
    }
    toast.info('로그아웃 되었어요')
  }

  return (
    <AuthContext.Provider value={{ user, loading, profile, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
