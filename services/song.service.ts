import type { Song } from '@/types/domain'

const STORAGE_KEY = 'today-songs'

function loadSongs(): Song[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveSongs(songs: Song[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
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
