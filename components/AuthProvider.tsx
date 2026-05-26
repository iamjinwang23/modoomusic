'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { setSongOwner } from '@/services/song.service'
import { setCollectionOwner } from '@/services/collection.service'
import { toast } from '@/components/toast/toast'

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null
      setUser(u)
      setSongOwner(u?.id ?? null)
      setCollectionOwner(u?.id ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 유저 바뀌면 프로필 1회 fetch
  useEffect(() => {
    refreshProfile()
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
