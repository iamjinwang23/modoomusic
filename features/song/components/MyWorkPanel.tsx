'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import { CollectionPickerModal } from './CollectionPickerModal'
import { MyCollectionPanel } from './MyCollectionPanel'
import { PublishModal } from './PublishModal'
import { collectionService } from '@/services/collection.service'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import type { Song } from '@/types/domain'

const ICON_FILTER = 'invert(0.45)'

function thumbGradient(song: Song) {
  const hue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function SkeletonItem() {
  return (
    <li className="px-4 py-3 flex items-stretch gap-3">
      <div className="w-2 h-2 rounded-full bg-white/[0.06] shrink-0 self-start mt-2" />
      <div className="shimmer w-16 aspect-[2/3] rounded-lg bg-white/[0.08] shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col py-0.5">
        <div className="shimmer h-4 bg-white/[0.08] rounded-full w-3/5" />
        <div className="shimmer h-3 bg-white/[0.06] rounded-full w-4/5 mt-1.5" />
        <div className="flex items-center gap-1 mt-3">
          <div className="w-[35px] h-[35px] rounded-full bg-white/[0.06] shrink-0" />
          <div className="w-[35px] h-[35px] rounded-full bg-white/[0.06] shrink-0" />
          <div className="w-[35px] h-[35px] rounded-full bg-white/[0.06] shrink-0" />
          <div className="h-[35px] w-20 rounded-full bg-white/[0.06] shrink-0" />
        </div>
      </div>
    </li>
  )
}

function ConfirmUnpublishModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
        <p className="text-sm font-semibold text-white mb-1">게시물을 정말 게시 취소를 하시겠어요?</p>
        <p className="text-xs text-zinc-400 mb-5">게시 취소하면 더이상 탐색과 프로필, 검색에서 노출되지 않아요.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">취소</button>
          <button onClick={onConfirm} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">삭제할게요</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({ song, onConfirm, onCancel }: { song: Song; onConfirm: () => void; onCancel: () => void }) {
  const displayTitle = song.title || song.prompt.slice(0, 30) + (song.prompt.length > 30 ? '…' : '')
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
        <p className="text-sm font-semibold text-white mb-1">삭제하시겠어요?</p>
        <p className="text-xs text-zinc-400 mb-5 truncate">"{displayTitle}"</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
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

export function MyWorkPanel({ showCollections = false }: { showCollections?: boolean }) {
  const [tab, setTab] = useState<'songs' | 'collections'>('songs')
  const [songs, setSongs] = useState<Song[]>([])
  const [editing, setEditing] = useState<Song | null>(null)
  const [deleting, setDeleting] = useState<Song | null>(null)
  const [generating, setGenerating] = useState(false)
  const [collecting, setCollecting] = useState<Song | null>(null)
  const [publishing, setPublishing] = useState<Song | null>(null)
  const [unpublishing, setUnpublishing] = useState<Song | null>(null)

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

  function confirmUnpublish() {
    if (!unpublishing) return
    songService.update(unpublishing.id, { published: false, publishedAt: undefined })
    setUnpublishing(null)
    window.dispatchEvent(new CustomEvent('song-updated'))
  }

  function handleOpen(song: Song) {
    const idx = songs.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('view-song', {
      detail: { feed: songs, idx, isOwner: true },
    }))
  }

  function handleThumbPlay(song: Song) {
    const idx = songs.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('play-song', {
      detail: { feed: songs, idx, isOwner: true },
    }))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-6">
        {showCollections ? (
          <div className="flex gap-6 text-xl font-semibold">
            <button
              onClick={() => setTab('songs')}
              className={`pb-1.5 transition-colors ${tab === 'songs' ? 'text-white border-b-2 border-zinc-200' : 'text-zinc-400 hover:text-white'}`}
            >
              내 음악
            </button>
            <button
              onClick={() => setTab('collections')}
              className={`pb-1.5 transition-colors ${tab === 'collections' ? 'text-white border-b-2 border-zinc-200' : 'text-zinc-400 hover:text-white'}`}
            >
              내 컬렉션
            </button>
          </div>
        ) : (
          <h2 className="text-xl font-semibold text-white">내 음악</h2>
        )}
      </div>

      {showCollections && tab === 'collections' ? (
        <div className="flex-1 overflow-hidden">
          <MyCollectionPanel />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto">
        {songs.length === 0 && !generating ? (
          <div className="pt-32 pb-16 text-center px-6">
            <Image src="/Confused.svg" alt="" width={48} height={48} className="mx-auto mb-3 opacity-40" style={{ filter: 'invert(1)' }} />
            <p className="text-xs text-zinc-400">아직 만든 음악이 없어요</p>
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
                  onCollect={() => setCollecting(song)}
                  onPublish={() => setPublishing(song)}
                  onUnpublish={() => setUnpublishing(song)}
                  onThumbPlay={() => handleThumbPlay(song)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {collecting && (
        <CollectionPickerModal song={collecting} onClose={() => setCollecting(null)} />
      )}

      {publishing && (
        <PublishModal song={publishing} onClose={() => setPublishing(null)} />
      )}

      {unpublishing && (
        <ConfirmUnpublishModal
          onConfirm={confirmUnpublish}
          onCancel={() => setUnpublishing(null)}
        />
      )}

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

function IconBtn({ src, title, filter, active, onClick, size = 'md' }: { src: string; title: string; filter: string; active?: boolean; onClick?: () => void; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-[35px] h-[35px]' : 'w-10 h-10'
  const iconSz = size === 'sm' ? 15 : 18
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.stopPropagation(); onClick?.() }}
      className={`${sz} rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-white hover:bg-zinc-100' : 'hover:bg-white/[0.08]'
      }`}
    >
      <Image src={src} alt={title} width={iconSz} height={iconSz} style={{ filter: active ? 'invert(0)' : filter }} />
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
            className="fixed bg-[#282D38] border border-white/[0.08] rounded-xl py-1 min-w-[110px] shadow-xl z-[55]"
            style={{ top: pos.top, right: pos.right }}
          >
            <button
              onClick={() => { close(); onEdit() }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
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

function SongWorkItem({ song, onOpen, onEdit, onDelete, onCollect, onPublish, onUnpublish, onThumbPlay }: { song: Song; onOpen: () => void; onEdit: () => void; onDelete: () => void; onCollect: () => void; onPublish: () => void; onUnpublish: () => void; onThumbPlay: () => void }) {
  const player = useGlobalPlayer()
  const isCurrentSong = player.song?.id === song.id
  const playing = isCurrentSong && player.isPlaying
  const [liked, setLiked] = useState(song.liked ?? false)
  const [isNew, setIsNew] = useState(song.isNew ?? false)
  const [inCollection, setInCollection] = useState(() => collectionService.getSongCollectionIds(song.id).length > 0)

  useEffect(() => {
    function handler() { setInCollection(collectionService.getSongCollectionIds(song.id).length > 0) }
    window.addEventListener('collection-updated', handler)
    return () => window.removeEventListener('collection-updated', handler)
  }, [song.id])

  const displayTitle = song.title || 'Untitled'
  const tags = [song.genre, song.mood].filter(Boolean).join(', ')

  function clearNew() {
    if (!isNew) return
    setIsNew(false)
    songService.update(song.id, { isNew: false })
  }

  function handleThumbClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    clearNew()
    if (isCurrentSong) {
      player.togglePlay()
    } else {
      onThumbPlay()
    }
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
      <div className="px-4 py-3 flex items-stretch gap-3">
        {/* 신규 인디케이터 */}
        <div
          className={`w-2 h-2 rounded-full bg-red-500 shrink-0 transition-opacity self-start mt-2 ${isNew ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* 썸네일 — 우측 컬럼 높이에 맞게 늘어남 */}
        <div
          onClick={handleThumbClick}
          className="w-16 aspect-[2/3] rounded-lg shrink-0 cursor-pointer overflow-hidden relative"
        >
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-[1.05]"
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
          </div>
          {/* 하단 그라데이션 + 재생시간 */}
          {formatDuration(song.duration) && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <span className="absolute bottom-2 left-1.5 text-[10px] font-medium text-white leading-none pointer-events-none">
                {formatDuration(song.duration)}
              </span>
            </>
          )}
        </div>

        {/* 우측 컬럼 */}
        <div className="flex-1 min-w-0 flex flex-col py-0.5">
          {/* 제목 행 + 더보기 */}
          <div className="flex items-start gap-2 mb-1">
            <button type="button" onClick={() => { clearNew(); onOpen() }} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-base font-medium text-white truncate">{displayTitle}</p>
                {song.instrumental && (
                  <span className="shrink-0 text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-white/[0.06] leading-none">
                    Instrumental
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 truncate">{tags || song.prompt}</p>
            </button>
            <MoreMenu onEdit={onEdit} onDelete={onDelete} />
          </div>

          {/* 액션 아이콘 행 */}
          <div className="flex items-center gap-1 mt-3">
            <IconBtn src="/Thumb-Up.svg" title="좋아요" filter={ICON_FILTER} active={liked} onClick={handleLike} size="sm" />
            <IconBtn src="/Collection.svg" title="컬렉션" filter={ICON_FILTER} active={inCollection} onClick={onCollect} size="sm" />
            <IconBtn src="/Share.svg" title="공유" filter={ICON_FILTER} onClick={handleShare} size="sm" />
            <button
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); song.published ? onUnpublish() : onPublish() }}
              className={`h-[35px] px-3.5 text-xs rounded-full border transition-all flex items-center gap-1.5 group/pub ${
                song.published
                  ? 'bg-white border-white text-zinc-900 hover:bg-zinc-100 opacity-100'
                  : 'border-white/20 text-zinc-400 hover:text-white hover:border-white/40 opacity-0 group-hover:opacity-100'
              }`}
            >
              <Image
                src="/Publish.svg"
                alt=""
                width={18}
                height={18}
                style={{ filter: song.published ? 'invert(0)' : ICON_FILTER }}
              />
              {song.published ? (
                <>
                  <span className="group-hover/pub:hidden">게시됨</span>
                  <span className="hidden group-hover/pub:inline text-red-500">게시 삭제</span>
                </>
              ) : '게시하기'}
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
