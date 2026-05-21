import type { Song } from '@/types/domain'

let currentUserId: string | null = null

export function setSongOwner(userId: string | null) {
  currentUserId = userId
}

function storageKey(): string | null {
  return currentUserId ? `today-songs-${currentUserId}` : null
}

function loadSongs(): Song[] {
  if (typeof window === 'undefined') return []
  const key = storageKey()
  if (!key) return []
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}

function saveSongs(songs: Song[]) {
  const key = storageKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify(songs))
}

export const songService = {
  getAll(): Song[] {
    return loadSongs()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((s) => ({
        ...s,
        // TODO: remove fallback once real API duration is populated
        duration: s.duration ?? (60 + (s.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 180)),
      }))
  },

  save(song: Omit<Song, 'id' | 'createdAt'>): Song {
    const songs = loadSongs()
    const newSong: Song = {
      ...song,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      isNew: true,
    }
    saveSongs([newSong, ...songs])
    window.dispatchEvent(new Event('song-updated'))
    return newSong
  },

  update(id: string, patch: Partial<Omit<Song, 'id' | 'createdAt'>>) {
    const songs = loadSongs()
    const idx = songs.findIndex((s) => s.id === id)
    if (idx === -1) return
    songs[idx] = { ...songs[idx], ...patch }
    saveSongs(songs)
    window.dispatchEvent(new Event('song-updated'))
  },

  getById(id: string): Song | undefined {
    return loadSongs().find((s) => s.id === id)
  },

  delete(id: string) {
    saveSongs(loadSongs().filter((s) => s.id !== id))
    window.dispatchEvent(new Event('song-updated'))
  },
}
