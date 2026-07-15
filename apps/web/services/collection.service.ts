import type { Collection } from '@mono/shared'

// 컬렉션 — 서버(Supabase) 저장으로 웹·앱 완전 동기화. /api/collections 사용(클라 전용, 상대 fetch).
async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`collection_${method}_${res.status}`)
  return res.json() as Promise<T>
}

async function getAll(): Promise<Collection[]> {
  try {
    const j = await req<{ collections?: Collection[] }>('/api/collections')
    return j.collections ?? []
  } catch {
    return []
  }
}

export const collectionService = {
  getAll,
  // 서버 GET이 비어 있으면 기본 컬렉션을 생성해 반환 → ensureDefault=getAll
  ensureDefault: getAll,

  async create(name: string): Promise<Collection> {
    const j = await req<{ collection: Collection }>('/api/collections', 'POST', { name })
    return j.collection
  },

  async rename(collectionId: string, name: string): Promise<void> {
    await req(`/api/collections/${collectionId}`, 'PATCH', { name })
  },

  async delete(collectionId: string): Promise<void> {
    await req(`/api/collections/${collectionId}`, 'DELETE')
  },

  async addSong(collectionId: string, songId: string): Promise<void> {
    await req(`/api/collections/${collectionId}/songs`, 'POST', { songId })
  },

  async removeSong(collectionId: string, songId: string): Promise<void> {
    await req(`/api/collections/${collectionId}/songs?songId=${songId}`, 'DELETE')
  },

  async getSongCollectionIds(songId: string): Promise<string[]> {
    return (await getAll()).filter((c) => c.songIds.includes(songId)).map((c) => c.id)
  },
}
