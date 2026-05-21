'use client'

import { useState, useEffect } from 'react'
import { collectionService } from '@/services/collection.service'
import type { Collection, Song } from '@/types/domain'

function hueGradient(id: string) {
  const hue = (id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

function CollectionCover({ collection }: { collection: Collection }) {
  const ids = collection.songIds.slice(0, 4)
  if (ids.length === 0) return <div className="w-12 h-12 rounded-lg bg-zinc-800 shrink-0" />
  if (ids.length === 1) return <div className="w-12 h-12 rounded-lg shrink-0" style={{ background: hueGradient(ids[0]) }} />
  return (
    <div className="w-12 h-12 rounded-lg shrink-0 overflow-hidden grid grid-cols-2 gap-[1px] bg-zinc-900">
      {Array.from({ length: 4 }).map((_, i) => {
        const id = ids[i] ?? ids[ids.length - 1]
        return <div key={i} style={{ background: hueGradient(id) }} />
      })}
    </div>
  )
}

interface Props {
  song: Song
  onClose: () => void
}

export function CollectionPickerModal({ song, onClose }: Props) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [inIds, setInIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    setCollections(collectionService.ensureDefault())
    setInIds(new Set(collectionService.getSongCollectionIds(song.id)))
  }, [song.id])

  function refresh() {
    setCollections(collectionService.getAll())
  }

  function toggle(collectionId: string) {
    if (inIds.has(collectionId)) {
      collectionService.removeSong(collectionId, song.id)
      setInIds((prev) => { const s = new Set(prev); s.delete(collectionId); return s })
    } else {
      collectionService.addSong(collectionId, song.id)
      setInIds((prev) => new Set([...prev, collectionId]))
    }
    refresh()
    window.dispatchEvent(new CustomEvent('collection-updated'))
  }

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const col = collectionService.create(name, undefined)
    collectionService.addSong(col.id, song.id)
    setInIds((prev) => new Set([...prev, col.id]))
    refresh()
    window.dispatchEvent(new CustomEvent('collection-updated'))
    setNewName('')
    setCreating(false)
  }

  const songHue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const songH2 = (songHue + 55) % 360
  const songGradient = `linear-gradient(135deg, hsl(${songHue},65%,48%) 0%, hsl(${songH2},55%,32%) 100%)`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl w-full max-w-[360px] overflow-hidden shadow-2xl">

        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06]">
          <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: songGradient }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{song.title || song.prompt.slice(0, 30)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">컬렉션에 담기</p>
          </div>
        </div>

        {/* 컬렉션 목록 */}
        <ul className="max-h-64 overflow-y-auto py-1">
          {collections.map((col) => {
            const active = inIds.has(col.id)
            return (
              <li key={col.id}>
                <button
                  onClick={() => toggle(col.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <CollectionCover collection={col} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{col.name}</p>
                    <p className="text-xs text-zinc-500">{col.songIds.length}곡</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-violet-600 border-violet-600' : 'border-zinc-600'}`}>
                    {active && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>

        {/* 새 컬렉션 */}
        <div className="border-t border-white/[0.06] px-4 py-3">
          {creating ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
                placeholder="컬렉션 이름"
                className="flex-1 bg-white/[0.06] text-sm text-white px-3 py-2 rounded-xl outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-violet-500"
              />
              <button onClick={handleCreate} className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-xl transition-colors font-medium">
                추가
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors py-1"
            >
              <span className="text-base leading-none font-medium">+</span> 새 컬렉션 만들기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
