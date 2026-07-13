import AsyncStorage from '@react-native-async-storage/async-storage'

// 로컬 컬렉션(저장한 곡) — 웹은 localStorage 기반, 앱은 AsyncStorage.
// ⚠️ 앱엔 아직 '내 컬렉션' 보기 화면이 없음 — 저장 토글만. 뷰는 후속 작업.
const KEY = 'mono-collection-song-ids'

async function load(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export async function isCollected(songId: string): Promise<boolean> {
  return (await load()).has(songId)
}

// 저장/해제 토글 → 결과(저장됨 여부) 반환
export async function toggleCollected(songId: string): Promise<boolean> {
  const set = await load()
  const next = !set.has(songId)
  if (next) set.add(songId)
  else set.delete(songId)
  try { await AsyncStorage.setItem(KEY, JSON.stringify([...set])) } catch { /* 무시 */ }
  return next
}
