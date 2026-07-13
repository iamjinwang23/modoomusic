import { supabase } from './supabase'

// 현재 사용자 표시명 캐시 — 내 곡 재생 시 track.artist 폴백('내 음악' 대신 내 이름).
let cached: string | null = null
let fetched = false

export function primeMyDisplayName(name: string | null) {
  cached = name
  fetched = true
}

export function getCachedDisplayName(): string | null {
  return cached
}

export async function myDisplayName(): Promise<string | null> {
  if (fetched) return cached
  fetched = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('profiles').select('display_name, username').eq('id', user.id).maybeSingle()
      const p = data as { display_name?: string | null; username?: string | null } | null
      cached = p?.display_name || p?.username || null
    }
  } catch {
    // 무시 — 폴백은 '내 음악'
  }
  return cached
}
