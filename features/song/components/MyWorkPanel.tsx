'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import { CollectionPickerModal } from './CollectionPickerModal'
import { MyCollectionPanel } from './MyCollectionPanel'
import { PublishModal } from './PublishModal'
import { collectionService } from '@/services/collection.service'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { useAuth } from '@/components/AuthProvider'
import { toast } from '@/components/toast/toast'
import { buildSongShareUrl } from '@/utils/shareUrl'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
import { AnimatedGradientBackground } from '@/components/AnimatedGradientBackground'
import { FloatingDots } from '@/components/FloatingDots'
import type { Song } from '@/types/domain'

const ICON_FILTER = 'invert(0.45)'

function formatCount(n: number) {
  if (n >= 10000) return `${+(n / 10000).toFixed(1)}만`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}

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
  const { user } = useAuth()
  const [tab, setTab] = useState<'songs' | 'collections'>('songs')
  const [songs, setSongs] = useState<Song[]>([])
  const [editing, setEditing] = useState<Song | null>(null)
  const [deleting, setDeleting] = useState<Song | null>(null)
  // AuthProvider의 캐시된 profile 사용 — 중복 fetch 방지
  const { profile } = useAuth()
  const ownerAvatarUrl = profile?.avatarUrl ?? null
  const ownerAvatarHue = profile?.avatarHue ?? null
  const ownerName = profile?.displayName ?? profile?.username ?? null
  const [collecting, setCollecting] = useState<Song | null>(null)
  const [publishing, setPublishing] = useState<Song | null>(null)
  const [unpublishing, setUnpublishing] = useState<Song | null>(null)

  useEffect(() => {
    setSongs(user ? songService.getAll() : [])
    const onUpdated = () => setSongs(user ? songService.getAll() : [])
    const onLikeUpdated = (e: Event) => {
      const { songId, likeCount } = (e as CustomEvent<{ songId: string; liked: boolean; likeCount: number }>).detail
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, likeCount } : s))
    }
    window.addEventListener('song-updated', onUpdated)
    window.addEventListener('like-updated', onLikeUpdated)
    return () => {
      window.removeEventListener('song-updated', onUpdated)
      window.removeEventListener('like-updated', onLikeUpdated)
    }
  }, [user])

  function confirmDelete() {
    if (!deleting) return
    const snapshot = songService.delete(deleting.id)
    setDeleting(null)
    window.dispatchEvent(new CustomEvent('song-updated'))
    if (snapshot) {
      toast.info('곡이 삭제되었어요', {
        duration: 5000,
        action: {
          label: '실행 취소',
          onClick: () => {
            songService.restore(snapshot)
            toast.success('곡이 복원되었어요')
          },
        },
      })
    }
  }

  function confirmUnpublish() {
    if (!unpublishing) return
    songService.update(unpublishing.id, { published: false, publishedAt: undefined })
    setUnpublishing(null)
    window.dispatchEvent(new CustomEvent('song-updated'))
    toast.info('게시가 취소되었어요')
  }

  function handleOpen(song: Song) {
    const idx = songs.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('view-song', {
      detail: { feed: songs, idx, isOwner: true, ownerUserId: user?.id ?? null, ownerAvatarUrl, ownerAvatarHue, ownerName },
    }))
  }

  function handleThumbPlay(song: Song) {
    const idx = songs.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('play-song', {
      detail: { feed: songs, idx, isOwner: true, ownerUserId: user?.id ?? null, ownerAvatarUrl, ownerAvatarHue, ownerName },
    }))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-6">
        {showCollections ? (
          <div className="flex gap-6 text-xl font-semibold items-center">
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
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'sidebar' }))}
              className="pb-1.5 flex items-center gap-1.5 text-zinc-600 cursor-not-allowed hover:text-zinc-500 transition-colors"
              title="곧 출시될 기능이에요"
            >
              내 뮤직비디오
              <span className="text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full leading-none">곧 출시</span>
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
        {songs.length === 0 ? (
          <div className="relative h-full min-h-[420px] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
            <AnimatedGradientBackground className="opacity-60" />
            <FloatingDots className="opacity-70" />
            <div className="relative z-10 -translate-y-24">
              <Image src="/Ai-Generate-Music.svg" alt="" width={48} height={48} className="mx-auto mb-3 opacity-50" style={{ filter: 'invert(1)' }} />
              <p className="text-sm text-zinc-300">나만의 음악을 만들어보세요</p>
              {showCollections && (
                <Link
                  href="/"
                  className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors"
                >
                  <Image src="/Sparkles.svg" alt="" width={16} height={16} />
                  음악 만들기
                </Link>
              )}
            </div>
          </div>
        ) : (
          <ul>
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

function IconBtn({ src, title, filter, active, count, onClick, size = 'md' }: { src: string; title: string; filter: string; active?: boolean; count?: number; onClick?: () => void; size?: 'sm' | 'md' }) {
  const hasCount = count !== undefined
  const sz = size === 'sm'
    ? (hasCount ? 'h-[30px] md:h-[35px] px-2 md:px-2.5' : 'w-[30px] h-[30px] md:w-[35px] md:h-[35px]')
    : (hasCount ? 'h-10 px-3' : 'w-10 h-10')
  const iconSz = size === 'sm' ? 15 : 18
  const iconCls = size === 'sm' ? 'w-[13px] h-[13px] md:w-[15px] md:h-[15px]' : ''
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.stopPropagation(); onClick?.() }}
      className={`${sz} rounded-full flex items-center justify-center gap-1.5 transition-colors ${
        active ? 'bg-white hover:bg-zinc-100' : 'bg-white/[0.06] hover:bg-white/[0.12]'
      }`}
    >
      <Image src={src} alt={title} width={iconSz} height={iconSz} className={iconCls} style={{ filter: active ? 'invert(0)' : filter }} />
      {hasCount && (
        <span className={`text-xs tabular-nums ${active ? 'text-black' : 'text-zinc-400'}`}>
          {formatCount(count)}
        </span>
      )}
    </button>
  )
}

function MoreMenu({ onEdit, onDelete, disableEdit = false }: { onEdit: () => void; onDelete: () => void; disableEdit?: boolean }) {
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
        className="w-8 h-8 md:w-10 md:h-10 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors"
      >
        <Image src="/More.svg" alt="더보기" width={18} height={18} className="w-4 h-4 md:w-[18px] md:h-[18px]" style={{ filter: ICON_FILTER }} />
      </button>

      {pos && (
        <>
          <div className="fixed inset-0 z-[54]" onClick={close} />
          <div
            className="fixed bg-[#282D38] border border-white/[0.08] rounded-xl py-1 min-w-[110px] shadow-xl z-[55]"
            style={{ top: pos.top, right: pos.right }}
          >
            {!disableEdit && (
              <button
                onClick={() => { close(); onEdit() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
              >
                <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: ICON_FILTER }} />
                편집
              </button>
            )}
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
  const isGenerating = song.status === 'generating'
  const isFailed = song.status === 'failed'

  useEffect(() => {
    function handler() { setInCollection(collectionService.getSongCollectionIds(song.id).length > 0) }
    window.addEventListener('collection-updated', handler)
    return () => window.removeEventListener('collection-updated', handler)
  }, [song.id])

  const displayTitle = song.title || 'Untitled'

  function clearNew() {
    if (!isNew) return
    setIsNew(false)
    songService.update(song.id, { isNew: false })
  }

  function handleThumbClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (isGenerating || isFailed) return  // 생성 중·실패 곡은 재생 불가
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
    const shareUrl = buildSongShareUrl(song.id)
    if (navigator.share) {
      await navigator.share({ title, url: shareUrl }).catch(() => {})
    } else {
      const ok = await navigator.clipboard.writeText(shareUrl).then(() => true).catch(() => false)
      if (ok) toast.success('링크가 복사되었어요')
      else toast.error('링크 복사에 실패했어요')
    }
  }

  return (
    <li className="hover:bg-white/[0.02] group">
      <div className="px-4 py-3 flex items-stretch gap-3">
        {/* 썸네일 — 2:3 비율 고정 (self-start로 stretch 방지) */}
        <div
          onClick={handleThumbClick}
          className={`w-14 md:w-16 aspect-[2/3] rounded-lg shrink-0 self-start overflow-hidden relative ${isGenerating || isFailed ? 'cursor-default' : 'cursor-pointer'}`}
        >
          {/* 신규 인디케이터 — 썸네일 좌하단 (시간과 같은 라인) */}
          <div
            className={`absolute bottom-2 left-1.5 z-10 w-2 h-2 rounded-full bg-red-500 transition-opacity pointer-events-none ${isNew && !isGenerating ? 'opacity-100' : 'opacity-0'}`}
          />
          <div
            className={`absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out ${isGenerating || isFailed ? '' : 'group-hover:scale-[1.05]'}`}
            style={song.coverImage ? undefined : { background: thumbGradient(song) }}
          >
            {song.coverImage && !isGenerating && (
              <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized />
            )}
            {isGenerating ? (
              <>
                <div className="absolute inset-0 bg-black/25 pointer-events-none" />
                <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin relative z-10" />
                <div className="absolute bottom-2 left-1.5 w-2 h-2 rounded-full bg-violet-400 animate-pulse pointer-events-none z-10" />
              </>
            ) : isFailed ? (
              <>
                <div className="absolute inset-0 bg-black/50 pointer-events-none" />
                <span className="relative z-10 text-[10px] font-medium text-red-400">실패</span>
              </>
            ) : playing ? (
              <>
                <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <SoundWaveIcon size={16} />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Image
                  src="/Play.svg"
                  alt="재생"
                  width={18}
                  height={18}
                  className="w-4 h-4 md:w-[18px] md:h-[18px] opacity-0 group-hover:opacity-75"
                  style={{ filter: 'invert(1)', transition: 'opacity 0.15s' }}
                />
              </div>
            )}
          </div>
          {/* 하단 그라데이션 + 재생시간 (generating/failed에선 숨김) */}
          {!isGenerating && !isFailed && formatDuration(song.duration) && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <span className="absolute bottom-2 right-1.5 text-[10px] font-medium text-white leading-none pointer-events-none">
                {formatDuration(song.duration)}
              </span>
            </>
          )}
        </div>

        {/* 우측 컬럼 */}
        <div className="flex-1 min-w-0 flex flex-col py-0.5">
          {/* 제목 행 + 더보기 */}
          <div className="flex items-start gap-2 mb-0 md:mb-1">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => { if (isGenerating) return; clearNew(); onOpen() }}
              className={`flex-1 min-w-0 text-left ${isGenerating ? 'cursor-default' : ''}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-base font-medium text-white truncate">{displayTitle}</p>
                {song.instrumental && !isGenerating && (
                  <span className="shrink-0 text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-white/[0.06] leading-none">
                    Inst.
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 truncate">
                {isGenerating ? '음악 만드는 중…' : isFailed ? '생성에 실패했어요' : song.prompt}
              </p>
            </button>
            {/* generating일 땐 편집 메뉴 숨기고 삭제만 가능하게 */}
            <MoreMenu onEdit={onEdit} onDelete={onDelete} disableEdit={isGenerating || isFailed} />
          </div>

          {/* 액션 아이콘 행 — generating/failed면 숨김 (모바일에선 썸네일 안쪽으로 끌어올림) */}
          {!isGenerating && !isFailed && (
          <div className="flex items-center gap-2 mt-1.5 md:mt-3">
            <div className="flex items-center gap-1.5 px-2 md:px-2.5 h-[30px] md:h-[35px] rounded-full bg-white/[0.06] text-xs text-zinc-400 tabular-nums shrink-0">
              <Image src="/Play.svg" alt="" width={13} height={13} className="w-[11px] h-[11px] md:w-[13px] md:h-[13px]" style={{ filter: 'invert(0.55)' }} />
              <span>{formatCount(song.playCount ?? 0)}</span>
            </div>
            <IconBtn src="/Thumb-Up.svg" title="좋아요" filter={ICON_FILTER} active={liked} count={song.likeCount ?? 0} onClick={handleLike} size="sm" />
            <IconBtn src="/Collection.svg" title="컬렉션" filter={ICON_FILTER} active={inCollection} onClick={onCollect} size="sm" />
            <IconBtn src="/Share.svg" title="공유" filter={ICON_FILTER} onClick={handleShare} size="sm" />
            <button
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); song.published ? onUnpublish() : onPublish() }}
              className={`h-[30px] md:h-[35px] px-3 md:px-3.5 text-xs rounded-full border transition-all flex items-center gap-1 md:gap-1.5 group/pub ${
                song.published
                  ? 'bg-white border-white text-zinc-900 hover:bg-zinc-100'
                  : 'border-white/20 text-zinc-400 hover:text-white hover:border-white/40'
              }`}
            >
              <Image
                src="/Publish.svg"
                alt=""
                width={18}
                height={18}
                className="w-4 h-4 md:w-[18px] md:h-[18px]"
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
          )}
        </div>
      </div>
    </li>
  )
}
