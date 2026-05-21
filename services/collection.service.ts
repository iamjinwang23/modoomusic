import type { Collection } from '@/types/domain'

const KEY = 'today-collections'
const DEFAULT_ID = 'col-default'

function load(): Collection[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function persist(cols: Collection[]) {
  localStorage.setItem(KEY, JSON.stringify(cols))
}

export const collectionService = {
  getAll(): Collection[] {
    return load()
  },

  ensureDefault(): Collection[] {
    let cols = load()
    if (!cols.find((c) => c.id === DEFAULT_ID)) {
      cols = [{ id: DEFAULT_ID, name: '기본 컬렉션', songIds: [], createdAt: new Date().toISOString() }, ...cols]
      persist(cols)
    }
    return cols
  },

  addSong(collectionId: string, songId: string): void {
    const cols = load()
    const col = cols.find((c) => c.id === collectionId)
    if (col && !col.songIds.includes(songId)) {
      col.songIds = [songId, ...col.songIds]
      persist(cols)
    }
  },

  removeSong(collectionId: string, songId: string): void {
    const cols = load()
    const col = cols.find((c) => c.id === collectionId)
    if (col) {
      col.songIds = col.songIds.filter((id) => id !== songId)
      persist(cols)
    }
  },

  create(name: string, coverImage?: string): Collection {
    const cols = load()
    const col: Collection = { id: `col-${Date.now()}`, name, coverImage, songIds: [], createdAt: new Date().toISOString() }
    persist([...cols, col])
    return col
  },

  delete(collectionId: string): void {
    persist(load().filter((c) => c.id !== collectionId))
  },

  rename(collectionId: string, name: string): void {
    const cols = load()
    const col = cols.find((c) => c.id === collectionId)
    if (col) { col.name = name; persist(cols) }
  },

  getSongCollectionIds(songId: string): string[] {
    return load().filter((c) => c.songIds.includes(songId)).map((c) => c.id)
  },
}
