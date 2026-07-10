import * as SecureStore from 'expo-secure-store'

// 최근 검색어 — 웹 RecentSearches 파리티(10 FIFO). 앱은 expo-secure-store로 영속.
const KEY = 'mono.search.recent'
const MAX = 10

export async function loadRecents(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function save(list: string[]): Promise<void> {
  try { await SecureStore.setItemAsync(KEY, JSON.stringify(list)) } catch { /* 무시 */ }
}

export async function addRecent(q: string): Promise<string[]> {
  const t = q.trim()
  if (!t) return loadRecents()
  const cur = await loadRecents()
  const next = [t, ...cur.filter((x) => x !== t)].slice(0, MAX)
  await save(next)
  return next
}

export async function removeRecent(q: string): Promise<string[]> {
  const cur = await loadRecents()
  const next = cur.filter((x) => x !== q)
  await save(next)
  return next
}

export async function clearRecents(): Promise<void> {
  try { await SecureStore.deleteItemAsync(KEY) } catch { /* 무시 */ }
}
