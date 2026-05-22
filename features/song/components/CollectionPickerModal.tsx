'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { collectionService } from '@/services/collection.service'
import { songService } from '@/services/song.service'
import { useAuth } from '@/components/AuthProvider'
import { toast } from '@/components/toast/toast'
import type { Collection, Song } from '@/types/domain'

function hueGradient(id: string) {
  const hue = (id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

// 컬렉션 커버 — 정방형
function CollectionCover({ collection }: { collection: Collection }) {
  if (collection.coverImage) {
    return (
      <div className="w-11 aspect-square rounded-lg overflow-hidden shrink-0 relative">
        <Image src={collection.coverImage} alt="" fill className="object-cover" sizes="44px" unoptimized />
      </div>
    )
  }
  const ids = collection.songIds.slice(0, 4)
  if (ids.length === 0) return <div className="w-11 aspect-square rounded-lg bg-zinc-800 shrink-0" />
  const firstWithCover = collection.songIds.map(songService.getById).find((s) => s?.coverImage)
  if (firstWithCover?.coverImage) {
    return (
      <div className="w-11 aspect-square rounded-lg overflow-hidden shrink-0 relative">
        <Image src={firstWithCover.coverImage} alt="" fill className="object-cover" sizes="44px" unoptimized />
      </div>
    )
  }
  if (ids.length === 1) return <div className="w-11 aspect-square rounded-lg shrink-0" style={{ background: hueGradient(ids[0]) }} />
  return (
    <div className="w-11 aspect-square rounded-lg shrink-0 overflow-hidden grid grid-cols-2 gap-[1px] bg-zinc-900">
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
  const { profile } = useAuth()
  const ownerName = profile?.displayName ?? profile?.username ?? '내 음악'
  const [collections, setCollections] = useState<Collection[]>([])
  const [inIds, setInIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setCollections(collectionService.ensureDefault())
    setInIds(new Set(collectionService.getSongCollectionIds(song.id)))
  }, [song.id])

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  function refresh() {
    setCollections(collectionService.getAll())
  }

  function toggle(collectionId: string) {
    const col = collections.find((c) => c.id === collectionId)
    const colName = col?.name ?? '컬렉션'
    if (inIds.has(collectionId)) {
      collectionService.removeSong(collectionId, song.id)
      setInIds((prev) => { const s = new Set(prev); s.delete(collectionId); return s })
      toast.info(`'${colName}'에서 제거되었어요`)
    } else {
      collectionService.addSong(collectionId, song.id)
      setInIds((prev) => new Set([...prev, collectionId]))
      toast.success(`'${colName}'에 담았어요`)
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
    toast.success(`'${name}' 컬렉션이 만들어졌어요`)
    setNewName('')
    setCreating(false)
  }

  const songHue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const songH2 = (songHue + 55) % 360
  const songGradient = `linear-gradient(135deg, hsl(${songHue},65%,48%) 0%, hsl(${songH2},55%,32%) 100%)`
  const songTitle = song.title || song.prompt.slice(0, 30)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-280 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl w-full max-w-[420px] overflow-hidden shadow-2xl transition-all duration-280 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
        }}
      >
        {/* 헤더 — SongEditModal과 동일한 패턴 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <p className="text-xl font-semibold text-white">컬렉션에 담기</p>
          <button onClick={handleClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        {/* 곡 정보 */}
        <div className="flex items-center gap-3 px-5 pb-4">
          <div
            className="w-12 aspect-[2/3] rounded-lg shrink-0 overflow-hidden relative"
            style={song.coverImage ? undefined : { background: songGradient }}
          >
            {song.coverImage && (
              <Image src={song.coverImage} alt="" fill className="object-cover" sizes="48px" unoptimized />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{songTitle}</p>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{ownerName}</p>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-white/[0.06]" />

        {/* 컬렉션 목록 */}
        <ul className="max-h-64 overflow-y-auto py-1">
          {collections.map((col) => {
            const active = inIds.has(col.id)
            return (
              <li key={col.id}>
                <button
                  onClick={() => toggle(col.id)}
                  className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
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
        <div className="border-t border-white/[0.06] px-5 py-3">
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
