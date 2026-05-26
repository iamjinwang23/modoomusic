'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { collectionService } from '@/services/collection.service'
import { songService } from '@/services/song.service'
import { useAuth } from '@/components/AuthProvider'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { toast } from '@/components/toast/toast'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
import type { Collection, Song } from '@/types/domain'

function hueGradient(id: string) {
  const hue = (id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

function FolderCover({ collection, className = '', isDefault = false }: { collection: Collection; className?: string; isDefault?: boolean }) {
  if (collection.coverImage) {
    return (
      <div className={`w-full aspect-square rounded-2xl overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={collection.coverImage} alt={collection.name} className="w-full h-full object-cover" />
      </div>
    )
  }
  const ids = collection.songIds.slice(0, 4)
  if (ids.length === 0) {
    return <div className={`w-full aspect-square rounded-2xl ${isDefault ? 'bg-zinc-700' : 'bg-zinc-800'} ${className}`} />
  }
  // 기본 컬렉션: 최신 담은 곡의 썸네일 표시
  if (isDefault) {
    const lastId = collection.songIds[collection.songIds.length - 1]
    const lastSong = songService.getById(lastId)
    if (lastSong?.coverImage) {
      return (
        <div className={`w-full aspect-square rounded-2xl overflow-hidden ${className}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lastSong.coverImage} alt="" className="w-full h-full object-cover" />
        </div>
      )
    }
    return <div className={`w-full aspect-square rounded-2xl ${className}`} style={{ background: hueGradient(lastId) }} />
  }
  if (ids.length === 1) {
    return <div className={`w-full aspect-square rounded-2xl ${className}`} style={{ background: hueGradient(ids[0]) }} />
  }
  return (
    <div className={`w-full aspect-square rounded-2xl overflow-hidden grid grid-cols-2 gap-[2px] bg-zinc-900 ${className}`}>
      {Array.from({ length: 4 }).map((_, i) => {
        const id = ids[i] ?? ids[ids.length - 1]
        return <div key={i} style={{ background: hueGradient(id) }} />
      })}
    </div>
  )
}

/* ── 생성 모달 ── */
function CreateCollectionModal({ onClose, onCreate }: { onClose: () => void; onCreate: (col: Collection) => void }) {
  const [name, setName] = useState('')
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => setCoverPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleFile(file)
  }

  function handleSave() {
    if (!name.trim()) return
    const col = collectionService.create(name.trim(), coverPreview ?? undefined)
    window.dispatchEvent(new CustomEvent('collection-updated'))
    toast.success('컬렉션이 만들어졌어요')
    onCreate(col)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl w-full max-w-[320px] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-semibold text-white">새 컬렉션</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        {/* 커버 업로드 */}
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="w-full aspect-square rounded-2xl overflow-hidden cursor-pointer mb-4 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 transition-colors group relative"
        >
          {coverPreview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={coverPreview} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-500 group-hover:text-zinc-300 transition-colors">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              <span className="text-xs">커버 등록</span>
            </div>
          )}
          {coverPreview && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-xs text-white">변경</span>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

        {/* 제목 */}
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          placeholder="컬렉션 이름"
          className="w-full bg-white/[0.06] text-sm text-white px-3 py-2.5 rounded-xl outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-violet-500 mb-4"
        />

        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          저장
        </button>
      </div>
    </div>
  )
}

/* ── 삭제 확인 ── */
function ConfirmDeleteModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
        <p className="text-sm font-semibold text-white mb-1">컬렉션을 삭제할까요?</p>
        <p className="text-xs text-zinc-400 mb-5 truncate">"{name}"의 모든 곡이 컬렉션에서 제거돼요</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">아니요</button>
          <button onClick={onConfirm} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">삭제</button>
        </div>
      </div>
    </div>
  )
}

/* ── 컬렉션 상세 (곡 목록) ── */
function CollectionDetailView({ collection, onBack, onUpdated }: { collection: Collection; onBack: () => void; onUpdated: () => void }) {
  const [col, setCol] = useState(collection)
  const { profile, user } = useAuth()
  const ownerAvatarUrl = profile?.avatarUrl ?? null
  const ownerAvatarHue = profile?.avatarHue ?? null
  const ownerName = profile?.displayName ?? profile?.username ?? null
  const player = useGlobalPlayer()

  useEffect(() => { setCol(collection) }, [collection])

  function removeSong(songId: string) {
    const index = col.songIds.indexOf(songId)
    if (index === -1) return
    collectionService.removeSong(col.id, songId)
    setCol((prev) => ({ ...prev, songIds: prev.songIds.filter((id) => id !== songId) }))
    window.dispatchEvent(new CustomEvent('collection-updated'))
    onUpdated()
    toast.info('컬렉션에서 제거되었어요', {
      duration: 5000,
      action: {
        label: '실행 취소',
        onClick: () => {
          collectionService.addSongRestore(col.id, songId, index)
          setCol((prev) => {
            const next = [...prev.songIds]
            next.splice(Math.min(index, next.length), 0, songId)
            return { ...prev, songIds: next }
          })
          window.dispatchEvent(new CustomEvent('collection-updated'))
          onUpdated()
          toast.success('컬렉션에 복원되었어요')
        },
      },
    })
  }

  const songs = col.songIds.map((id) => songService.getById(id)).filter(Boolean) as Song[]

  function handleThumbClick(song: Song) {
    const idx = songs.findIndex((s) => s.id === song.id)
    if (player.song?.id === song.id) {
      player.togglePlay()
    } else {
      window.dispatchEvent(new CustomEvent('play-song', {
        detail: { feed: songs, idx, isOwner: true, ownerUserId: user?.id ?? null, ownerAvatarUrl, ownerAvatarHue, ownerName },
      }))
    }
  }

  function handleOpen(song: Song) {
    const idx = songs.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('view-song', {
      detail: { feed: songs, idx, isOwner: true, ownerUserId: user?.id ?? null, ownerAvatarUrl, ownerAvatarHue, ownerName },
    }))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors shrink-0"
        >
          <svg width="7" height="12" viewBox="0 0 8 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1L1 6.5 7 12" />
          </svg>
        </button>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{col.name}</p>
          <p className="text-xs text-zinc-500">{col.songIds.length}곡</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {songs.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center pt-20">아직 담긴 곡이 없어요</p>
        ) : (
          <ul>
            {songs.map((song) => {
              const hue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
              const h2 = (hue + 55) % 360
              const tags = [song.genre, song.mood].filter(Boolean).join(', ')
              const isCurrentSong = player.song?.id === song.id
              const playing = isCurrentSong && player.isPlaying
              return (
                <li key={song.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] group">
                  {/* 썸네일 — 클릭으로 재생 */}
                  <div
                    onClick={() => handleThumbClick(song)}
                    className="w-14 aspect-[2/3] rounded-lg shrink-0 cursor-pointer overflow-hidden relative"
                    style={song.coverImage ? undefined : { background: `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)` }}
                  >
                    {song.coverImage && (
                      <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized />
                    )}
                    {playing ? (
                      <>
                        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <SoundWaveIcon size={18} />
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Image
                          src="/Play.svg"
                          alt="재생"
                          width={18}
                          height={18}
                          style={{ filter: 'invert(1)' }}
                          className="opacity-0 group-hover:opacity-75"
                        />
                      </div>
                    )}
                  </div>
                  {/* 정보 — 클릭으로 상세 진입 */}
                  <button
                    type="button"
                    onClick={() => handleOpen(song)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium text-white truncate">{song.title || 'Untitled'}</p>
                    <p className="text-xs text-zinc-400 mt-1 truncate">{tags || song.prompt}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSong(song.id)}
                    title="컬렉션에서 제거"
                    className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-all shrink-0"
                  >
                    <Image src="/Close-Fill.svg" alt="제거" width={14} height={14} style={{ filter: 'invert(0.4)' }} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── 메인 패널 ── */
export function MyCollectionPanel() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [selected, setSelected] = useState<Collection | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function load() {
    setCollections(collectionService.ensureDefault())
  }

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('collection-updated', handler)
    return () => window.removeEventListener('collection-updated', handler)
  }, [])

  function handleDelete(col: Collection) {
    const snapshot = collectionService.delete(col.id)
    setDeletingId(null)
    if (selected?.id === col.id) setSelected(null)
    load()
    window.dispatchEvent(new CustomEvent('collection-updated'))
    if (snapshot) {
      toast.info('컬렉션이 삭제되었어요', {
        duration: 5000,
        action: {
          label: '실행 취소',
          onClick: () => {
            collectionService.restore(snapshot)
            load()
            window.dispatchEvent(new CustomEvent('collection-updated'))
            toast.success('컬렉션이 복원되었어요')
          },
        },
      })
    }
  }

  const deletingCol = collections.find((c) => c.id === deletingId)

  if (selected) {
    const fresh = collections.find((c) => c.id === selected.id) ?? selected
    return <CollectionDetailView collection={fresh} onBack={() => setSelected(null)} onUpdated={load} />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-wrap gap-3 p-4">
          {/* + 만들기 카드 */}
          <div
            onClick={() => setCreating(true)}
            className="w-[200px] cursor-pointer group"
          >
            <div className="w-full aspect-square rounded-2xl bg-zinc-800/60 border-2 border-dashed border-zinc-700 group-hover:border-zinc-500 group-hover:bg-zinc-800 transition-colors flex flex-col items-center justify-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors mt-2">컬렉션 만들기</p>
          </div>

          {/* 컬렉션 폴더들 */}
          {collections.map((col) => (
            <div key={col.id} className="w-[200px] group cursor-pointer" onClick={() => setSelected(col)}>
              <div className="relative overflow-hidden rounded-2xl">
                <FolderCover collection={col} isDefault={col.id === 'col-default'} className="transition-transform duration-300 ease-out group-hover:scale-[1.05]" />
                {col.id !== 'col-default' && (
                  <button
                    type="button"
                    title="삭제"
                    onClick={(e) => { e.stopPropagation(); setDeletingId(col.id) }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Image src="/Delete-2.svg" alt="삭제" width={12} height={12} style={{ filter: 'invert(0.6)' }} />
                  </button>
                )}
              </div>
              <p className="text-sm font-medium text-white mt-2 truncate">{col.name}</p>
              <p className="text-xs text-zinc-500">{col.songIds.length}곡</p>
            </div>
          ))}
        </div>
      </div>

      {creating && (
        <CreateCollectionModal onClose={() => setCreating(false)} onCreate={() => {}} />
      )}

      {deletingCol && (
        <ConfirmDeleteModal
          name={deletingCol.name}
          onConfirm={() => handleDelete(deletingCol)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  )
}
