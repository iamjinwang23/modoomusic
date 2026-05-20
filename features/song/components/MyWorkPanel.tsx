'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import type { Song } from '@/types/domain'

const ICON_FILTER = 'invert(0.45)'

function thumbGradient(song: Song) {
  const hue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

function SkeletonItem() {
  return (
    <li className="px-4 py-3.5 flex items-center gap-3">
      <div className="w-2 h-2 rounded-full bg-white/[0.06] shrink-0" />
      <div className="shimmer w-14 h-[72px] rounded-lg bg-white/[0.08] shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="shimmer h-3.5 bg-white/[0.08] rounded-full w-3/5" />
        <div className="shimmer h-3 bg-white/[0.06] rounded-full w-4/5" />
      </div>
    </li>
  )
}

function ConfirmDeleteModal({ song, onConfirm, onCancel }: { song: Song; onConfirm: () => void; onCancel: () => void }) {
  const displayTitle = song.title || song.prompt.slice(0, 30) + (song.prompt.length > 30 ? '…' : '')
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#1c1c1e] border border-white/[0.08] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
        <p className="text-sm font-semibold text-white mb-1">삭제하시겠어요?</p>
        <p className="text-xs text-zinc-400 mb-5 truncate">"{displayTitle}"</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
          >
            아니요
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            네
          </button>
        </div>
      </div>
    </div>
  )
}

export function MyWorkPanel() {
  const [songs, setSongs] = useState<Song[]>([])
  const [editing, setEditing] = useState<Song | null>(null)
  const [deleting, setDeleting] = useState<Song | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    setSongs(songService.getAll())
    const onGenerating = () => setGenerating(true)
    const onUpdated = () => { setGenerating(false); setSongs(songService.getAll()) }
    window.addEventListener('song-generating', onGenerating)
    window.addEventListener('song-updated', onUpdated)
    return () => {
      window.removeEventListener('song-generating', onGenerating)
      window.removeEventListener('song-updated', onUpdated)
    }
  }, [])

  function confirmDelete() {
    if (!deleting) return
    songService.delete(deleting.id)
    setDeleting(null)
    window.dispatchEvent(new CustomEvent('song-updated'))
  }

  function handleOpen(song: Song) {
    const idx = songs.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('view-song', {
      detail: { feed: songs, idx, isOwner: true },
    }))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-6">
        <div className="flex gap-6 text-base font-bold">
          <button className="text-zinc-200 border-b-2 border-zinc-200 pb-1.5">
            내 노래
          </button>
          <button className="text-zinc-400 hover:text-zinc-200 transition-colors pb-1.5">
            내 컬렉션
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {songs.length === 0 && !generating ? (
          <div className="pt-32 pb-16 text-center px-6">
            <Image src="/Confused.svg" alt="" width={48} height={48} className="mx-auto mb-3 opacity-40" style={{ filter: 'invert(1)' }} />
            <p className="text-xs text-zinc-400">아직 만든 노래가 없어요</p>
          </div>
        ) : (
          <ul>
            {generating && <SkeletonItem />}
            {songs.map((song) => (
              <SongWorkItem
                key={song.id}
                song={song}
                onOpen={() => handleOpen(song)}
                onEdit={() => setEditing(song)}
                onDelete={() => setDeleting(song)}
              />
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <SongEditModal song={editing} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDeleteModal
          song={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function IconBtn({ src, title, filter, active, onClick }: { src: string; title: string; filter: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.stopPropagation(); onClick?.() }}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-white hover:bg-zinc-100' : 'hover:bg-white/[0.08]'
      }`}
    >
      <Image src={src} alt={title} width={18} height={18} style={{ filter: active ? 'invert(0)' : filter }} />
    </button>
  )
}

function MoreMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!btnRef.current) return
    if (pos) {
      setPos(null)
    } else {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }

  function close() { setPos(null) }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="w-10 h-10 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors"
      >
        <Image src="/More.svg" alt="더보기" width={18} height={18} style={{ filter: ICON_FILTER }} />
      </button>

      {pos && (
        <>
          <div className="fixed inset-0 z-[54]" onClick={close} />
          <div
            className="fixed bg-[#2a2a2c] border border-white/[0.08] rounded-xl py-1 min-w-[110px] shadow-xl z-[55]"
            style={{ top: pos.top, right: pos.right }}
          >
            <button
              onClick={() => { close(); onEdit() }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06] transition-colors"
            >
              <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: ICON_FILTER }} />
              편집
            </button>
            <button
              onClick={() => { close(); onDelete() }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Image src="/Delete-2.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} />
              삭제
            </button>
          </div>
        </>
      )}
    </>
  )
}

function SongWorkItem({ song, onOpen, onEdit, onDelete }: { song: Song; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const [playing, setPlaying] = useState(false)
  const [liked, setLiked] = useState(song.liked ?? false)
  const [isNew, setIsNew] = useState(song.isNew ?? false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const displayTitle = song.title || 'Untitled'
  const tags = [song.genre, song.mood].filter(Boolean).join(', ')

  useEffect(() => {
    function handler(e: Event) {
      const id = (e as CustomEvent<string>).detail
      if (id !== song.id) audioRef.current?.pause()
    }
    window.addEventListener('audio-play', handler)
    return () => window.removeEventListener('audio-play', handler)
  }, [song.id])

  function clearNew() {
    if (!isNew) return
    setIsNew(false)
    songService.update(song.id, { isNew: false })
  }

  function handleThumbClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    clearNew()
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause() } else { audioRef.current.play() }
  }

  function handleLike() {
    const next = !liked
    setLiked(next)
    songService.update(song.id, { liked: next })
  }

  async function handleShare() {
    const title = song.title || song.prompt.slice(0, 40)
    if (navigator.share) {
      await navigator.share({ title, url: song.audioUrl }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(song.audioUrl).catch(() => {})
    }
  }

  return (
    <li className="hover:bg-white/[0.02] group">
      <div className="px-4 py-3.5 flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full bg-red-500 shrink-0 transition-opacity ${isNew ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          onClick={handleThumbClick}
          className="w-14 h-[72px] rounded-lg flex items-center justify-center shrink-0 cursor-pointer relative overflow-hidden"
          style={{ background: thumbGradient(song) }}
        >
          <Image
            src={playing ? '/Pause.svg' : '/Play.svg'}
            alt={playing ? '일시정지' : '재생'}
            width={18}
            height={18}
            style={{ filter: 'invert(1)', opacity: playing ? 0.85 : undefined, transition: 'opacity 0.15s' }}
            className={playing ? '' : 'opacity-0 group-hover:opacity-75'}
          />
          <audio
            ref={audioRef}
            src={song.audioUrl}
            onPlay={() => { setPlaying(true); window.dispatchEvent(new CustomEvent('audio-play', { detail: song.id })) }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </div>

        <button type="button" onClick={() => { clearNew(); onOpen() }} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{displayTitle}</p>
            {song.instrumental && (
              <span className="shrink-0 text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-white/[0.06] leading-none">
                Instrumental
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1 truncate">{tags || song.prompt}</p>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <IconBtn src="/Thumb-Up.svg" title="좋아요" filter={ICON_FILTER} active={liked} onClick={handleLike} />
          <IconBtn src="/Share.svg" title="공유" filter={ICON_FILTER} onClick={handleShare} />
          <MoreMenu onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </li>
  )
}
