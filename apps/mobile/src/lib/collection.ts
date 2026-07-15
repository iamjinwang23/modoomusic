import type { Collection } from '@mono/shared'
import { api } from './api'

// 컬렉션(저장한 곡 묶음) — 서버(Supabase) 저장으로 웹·앱 완전 동기화. /api/collections 사용.
async function getAll(): Promise<Collection[]> {
  try {
    const j = await api.get('/api/collections') as { collections?: Collection[] }
    return j.collections ?? []
  } catch {
    return []
  }
}

export const collections = {
  getAll,
  // 서버 GET이 비어 있으면 기본 컬렉션을 생성해 반환 → ensureDefault=getAll
  ensureDefault: getAll,

  async create(name: string): Promise<Collection> {
    const j = await api.post('/api/collections', { name }) as { collection: Collection }
    return j.collection
  },

  async rename(collectionId: string, name: string): Promise<void> {
    await api.patch(`/api/collections/${collectionId}`, { name })
  },

  async remove(collectionId: string): Promise<void> {
    await api.del(`/api/collections/${collectionId}`)
  },

  async addSong(collectionId: string, songId: string): Promise<void> {
    await api.post(`/api/collections/${collectionId}/songs`, { songId })
  },

  async removeSong(collectionId: string, songId: string): Promise<void> {
    await api.del(`/api/collections/${collectionId}/songs?songId=${songId}`)
  },

  async getSongCollectionIds(songId: string): Promise<string[]> {
    return (await getAll()).filter((c) => c.songIds.includes(songId)).map((c) => c.id)
  },
}

// 곡이 어떤 컬렉션에든 담겨 있는지 — 더보기 시트 '컬렉션' 강조용
export async function isInAnyCollection(songId: string): Promise<boolean> {
  return (await getAll()).some((c) => c.songIds.includes(songId))
}
