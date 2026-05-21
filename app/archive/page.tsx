'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SongCard } from '@/components/SongCard'
import { songService } from '@/services/song.service'
import type { Song } from '@/types/domain'

export default function ArchivePage() {
  const [songs, setSongs] = useState<Song[]>([])

  useEffect(() => {
    setSongs(songService.getAll())
  }, [])

  function handleDelete(id: string) {
    songService.delete(id)
    setSongs(songService.getAll())
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <Link href="/" className="font-bold text-violet-400">
          모두의 노래
        </Link>
        <div className="flex gap-4 text-sm">
          <span className="text-zinc-300">내 음악</span>
          <Link href="/auth" className="text-zinc-400 hover:text-white transition-colors">
            로그인
          </Link>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">내 음악 아카이브</h1>
          <span className="text-sm text-zinc-500">{songs.length}곡</span>
        </div>

        {songs.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <p className="text-4xl">🎵</p>
            <p className="text-zinc-400 text-sm">아직 만든 음악이 없어요</p>
            <Link
              href="/"
              className="inline-block mt-2 bg-violet-600 hover:bg-violet-500 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              첫 음악 만들기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
