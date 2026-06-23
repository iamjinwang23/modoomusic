'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import { VideoCoverModal } from '@/components/VideoCoverModal'
import { VideoCoverPlayer } from '@/components/VideoCoverPlayer'
import { DownloadDialog } from '@/components/DownloadDialog'
import { ConfirmModal } from '@/components/ConfirmModal'
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
import { GeneratingPhrase } from '@/components/GeneratingPhrase'
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


export function MyWorkPanel({ showCollections = false }: { showCollections?: boolean }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'songs' | 'collections'>('songs')
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState<boolean>(() => !songService.isLoaded())
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
  const [downloading, setDownloading] = useState<Song | null>(null)
  const [videoCovering, setVideoCovering] = useState<Song | null>(null)
  const [filter, setFilter] = useState<'all' | 'liked' | 'published'>('all')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)  // 모바일: 검색 아이콘→폭 모핑 오버레이
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSongs(user ? songService.getAll() : [])
    setLoading(user ? !songService.isLoaded() : false)
    const onUpdated = () => {
      setSongs(user ? songService.getAll() : [])
      setLoading(user ? !songService.isLoaded() : false)
    }
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

  // 내 음악 필터(전체/좋아요/게시) + 검색(제목·가사·키워드)
  const q = query.trim().toLowerCase()
  const filtered = songs.filter((s) => {
    if (filter === 'liked' && !s.liked) return false
    if (filter === 'published' && !s.published) return false
    if (q) {
      const hay = [s.title, s.prompt, s.genre, s.mood, s.lyrics, s.customLyrics].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

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
    const idx = filtered.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('view-song', {
      detail: { feed: filtered, idx, isOwner: true, ownerUserId: user?.id ?? null, ownerAvatarUrl, ownerAvatarHue, ownerName },
    }))
  }

  function handleThumbPlay(song: Song) {
    const idx = filtered.findIndex((s) => s.id === song.id)
    window.dispatchEvent(new CustomEvent('play-song', {
      detail: { feed: filtered, idx, isOwner: true, ownerUserId: user?.id ?? null, ownerAvatarUrl, ownerAvatarHue, ownerName },
    }))
  }

  const showEmptyAurora = !loading && songs.length === 0 && !(showCollections && tab === 'collections')

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {showEmptyAurora && <AnimatedGradientBackground className="opacity-60" />}
      <div className="relative z-10 px-6 py-6">
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
            {/* 내 뮤직비디오 — 실제 기능 도입 전까지 숨김 */}
          </div>
        ) : (
          <h2 className="text-xl font-semibold text-white">내 음악</h2>
        )}
      </div>

      {!(showCollections && tab === 'collections') && (loading || songs.length > 0) && (
        <div className="px-6 pb-3">
          <div className="relative flex items-center h-10 md:justify-between">
            {/* 필터 칩 — 모바일에서 검색 열리면 페이드아웃, 데스크톱은 항상 노출 */}
            <div className={`flex items-center gap-1.5 transition-opacity duration-200 md:opacity-100 md:pointer-events-auto ${searchOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {([
                ['all', '전체', null, 0],
                ['liked', '좋아요', '/Thumb-Up.svg', 15],
                ['published', '게시', '/Publish.svg', 17],
              ] as const).map(([key, label, icon, iconSize]) => {
                const active = filter === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`flex items-center gap-1.5 px-4 h-10 rounded-full text-[15px] border transition active:scale-[0.96] ${
                      active ? 'bg-white border-white text-zinc-900 font-medium' : 'bg-white/[0.06] border-transparent text-zinc-400 hover:text-white'
                    }`}
                  >
                    {icon && (
                      <Image src={icon} alt="" width={iconSize} height={iconSize} style={{ filter: active ? 'invert(0)' : 'invert(0.6)' }} />
                    )}
                    {label}
                  </button>
                )
              })}
            </div>
            {/* 검색 — 모바일: 아이콘→폭 모핑(칩 덮음). 데스크톱: 항상 펼친 입력 */}
            <div className={`absolute inset-y-0 right-0 md:static md:inset-auto flex items-center rounded-full bg-white/[0.06] border border-white/[0.08] overflow-hidden transition-[width] duration-300 ease-out shrink-0 ${searchOpen ? 'w-full' : 'w-10'} md:w-52`}>
              <button
                type="button"
                onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchInputRef.current?.focus()) }}
                className="w-10 h-10 shrink-0 flex items-center justify-center"
                aria-label="검색"
              >
                <Image src="/Search.svg" alt="" width={18} height={18} style={{ filter: 'invert(1)' }} />
              </button>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => { if (!query.trim()) setSearchOpen(false) }}
                placeholder="제목·가사·키워드 검색"
                className="flex-1 min-w-0 bg-transparent pr-1 text-[14px] text-white placeholder:text-zinc-500 focus:outline-none"
              />
              {/* 닫기 — 모바일 펼침 상태에서만. 검색어 비우고 접힘 */}
              {searchOpen && (
                <button
                  type="button"
                  onMouseDown={() => { setQuery(''); setSearchOpen(false) }}
                  className="md:hidden shrink-0 w-9 h-10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                  aria-label="검색 닫기"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 1l10 10M11 1L1 11" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCollections && tab === 'collections' ? (
        <div className="flex-1 overflow-hidden">
          <MyCollectionPanel />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto">
        {loading && songs.length === 0 ? (
          <ul aria-label="로딩 중">
            {Array.from({ length: 6 }).map((_, i) => <SongWorkItemSkeleton key={i} />)}
          </ul>
        ) : songs.length === 0 ? (
          <div className="relative h-full min-h-[420px] flex flex-col items-center justify-center text-center px-6">
            <div className="relative z-10 -translate-y-24">
              <Image src="/Ai-Generate-Music.svg" alt="" width={48} height={48} className="mx-auto mb-3 opacity-50" style={{ filter: 'invert(1)' }} />
              <p className="text-sm text-zinc-300">나만의 음악을 만들어보세요</p>
              {showCollections && (
                <Link
                  href="/create"
                  className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition active:scale-[0.96]"
                >
                  <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
                  음악 만들기
                </Link>
              )}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-zinc-500 text-sm px-6 text-center">
            <p>{query.trim() ? '검색 결과가 없어요' : '해당 조건의 곡이 없어요'}</p>
          </div>
        ) : (
          <ul>
              {filtered.map((song) => (
                <SongWorkItem
                  key={song.id}
                  song={song}
                  onOpen={() => handleOpen(song)}
                  onEdit={() => setEditing(song)}
                  onDelete={() => setDeleting(song)}
                  onCollect={() => setCollecting(song)}
                  onPublish={() => setPublishing(song)}
                  onUnpublish={() => setUnpublishing(song)}
                  onDownload={() => setDownloading(song)}
                  onVideoCover={() => setVideoCovering(song)}
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
        <ConfirmModal
          open={!!unpublishing}
          title="이 게시물을 정말 게시 취소하시겠어요?"
          description="게시를 취소하면 더 이상 탐색, 프로필, 검색 결과에 노출되지 않아요."
          confirmLabel="게시 취소하기"
          cancelLabel="아니요"
          variant="danger"
          onConfirm={confirmUnpublish}
          onClose={() => setUnpublishing(null)}
        />
      )}

      {editing && (
        <SongEditModal song={editing} onClose={() => setEditing(null)} />
      )}

      <VideoCoverModal
        open={!!videoCovering}
        songId={videoCovering?.id ?? ''}
        title={videoCovering?.title}
        coverImage={videoCovering?.coverImage}
        onClose={() => setVideoCovering(null)}
      />

      {deleting && (
        <ConfirmModal
          open={!!deleting}
          title="이 곡을 정말 삭제하시겠어요?"
          description={`"${deleting.title || deleting.prompt.slice(0, 30) + (deleting.prompt.length > 30 ? '…' : '')}"`}
          confirmLabel="삭제하기"
          cancelLabel="아니요"
          variant="danger"
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}

      <DownloadDialog
        open={!!downloading}
        onClose={() => setDownloading(null)}
        audioUrl={downloading?.audioUrl ?? ''}
        title={downloading?.title ?? '제목 없음'}
        artist={profile?.displayName ?? profile?.username ?? undefined}
        coverUrl={downloading?.coverImage ?? undefined}
      />
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
      className={`${sz} rounded-full flex items-center justify-center gap-1.5 transition active:scale-[0.96] ${
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

function MoreMenu({ onEdit, onDelete, onPublish, onDownload, onVideoCover, disableEdit = false, onCollect, inCollection = false }: { onEdit: () => void; onDelete: () => void; onPublish?: () => void; onDownload?: () => void; onVideoCover?: () => void; disableEdit?: boolean; onCollect?: () => void; inCollection?: boolean }) {
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
        className="w-8 h-8 md:w-10 md:h-10 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition active:scale-[0.92]"
      >
        <Image src="/More.svg" alt="더보기" width={18} height={18} className="w-4 h-4 md:w-[18px] md:h-[18px]" style={{ filter: ICON_FILTER }} />
      </button>

      {pos && (
        <>
          <div className="fixed inset-0 z-[54]" onClick={close} />
          <div
            className="fixed bg-[#282D38] border border-white/[0.08] rounded-xl py-1 min-w-[130px] shadow-xl z-[55]"
            style={{ top: pos.top, right: pos.right }}
          >
            {onCollect && (
              <button
                onClick={(e) => { e.stopPropagation(); close(); onCollect() }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-white/[0.06] transition-colors ${inCollection ? 'text-violet-400' : 'text-white'}`}
              >
                <Image
                  src="/Collection.svg"
                  alt=""
                  width={14}
                  height={14}
                  style={{ filter: inCollection ? 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)' : ICON_FILTER }}
                />
                컬렉션
              </button>
            )}
            {onPublish && (
              <>
                {onCollect && <div className="my-1 h-px bg-white/[0.06]" />}
                <button
                  onClick={() => { close(); onPublish() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
                >
                  <Image src="/Publish.svg" alt="" width={14} height={14} style={{ filter: ICON_FILTER }} />
                  게시하기
                </button>
                <div className="my-1 h-px bg-white/[0.06]" />
              </>
            )}
            {!onPublish && onCollect && (
              <div className="my-1 h-px bg-white/[0.06]" />
            )}
            {!disableEdit && (
              <button
                onClick={() => { close(); onEdit() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
              >
                <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: ICON_FILTER }} />
                편집
              </button>
            )}
            {onDownload && (
              <button
                onClick={() => { close(); onDownload() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
              >
                <Image src="/Arrow-To-Down.svg" alt="" width={14} height={14} style={{ filter: ICON_FILTER }} />
                다운로드
              </button>
            )}
            {onVideoCover && (
              <button
                onClick={() => { close(); onVideoCover() }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
              >
                <Image src="/Sparkles.svg" alt="" width={14} height={14} style={{ filter: ICON_FILTER }} />
                비디오 커버
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

function SongWorkItem({ song, onOpen, onEdit, onDelete, onCollect, onPublish, onUnpublish, onDownload, onVideoCover, onThumbPlay }: { song: Song; onOpen: () => void; onEdit: () => void; onDelete: () => void; onCollect: () => void; onPublish: () => void; onUnpublish: () => void; onDownload: () => void; onVideoCover: () => void; onThumbPlay: () => void }) {
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
    <li className="hover:bg-white/[0.03] transition-colors group">
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
            {!isGenerating && (song.videoCoverUrl || song.coverImage) && (
              <VideoCoverPlayer
                videoCoverUrl={playing && song.videoCoverStatus === 'done' ? song.videoCoverUrl : undefined}
                fallbackImageUrl={song.coverImage}
              />
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
          {/* 커버 가장자리 라인 — 좌측 패널 라인색 */}
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-white/[0.08]" />
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
                <p className="text-sm font-medium text-white truncate min-w-0">{displayTitle}</p>
                {song.model && (
                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-1 rounded-md leading-none ${
                    song.model === 'music-2.6'
                      ? 'text-violet-300 bg-violet-600/20'
                      : 'text-zinc-400 bg-zinc-800 ring-1 ring-inset ring-white/[0.06]'
                  }`}>
                    {`v${song.model.replace(/^music-/, '')}`}
                  </span>
                )}
                {song.instrumental && !isGenerating && (
                  <span className="shrink-0 text-[10px] font-medium text-zinc-400 bg-zinc-800 px-1.5 py-1 rounded-md ring-1 ring-inset ring-white/[0.06] leading-none">
                    Inst.
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 truncate">
                {isGenerating ? <GeneratingPhrase startedAt={song.createdAt} /> : isFailed ? '생성에 실패했어요' : song.prompt}
              </p>
            </button>
            {/* generating일 땐 편집·컬렉션 메뉴 숨기고 삭제만 가능하게. 미게시 곡은 '게시하기'를 더보기 안으로 */}
            <MoreMenu
              onEdit={onEdit}
              onDelete={onDelete}
              onPublish={!song.published && !isGenerating && !isFailed ? onPublish : undefined}
              onDownload={!isGenerating && !isFailed && song.audioUrl ? onDownload : undefined}
              onVideoCover={!isGenerating && !isFailed ? onVideoCover : undefined}
              disableEdit={isGenerating || isFailed}
              onCollect={!isGenerating && !isFailed ? onCollect : undefined}
              inCollection={inCollection}
            />
          </div>

          {/* 액션 아이콘 행 — generating/failed면 숨김 (모바일에선 썸네일 안쪽으로 끌어올림) */}
          {!isGenerating && !isFailed && (
          <div className="flex items-center gap-2 mt-1.5 md:mt-3">
            <div className="flex items-center gap-1.5 px-2 md:px-2.5 h-[30px] md:h-[35px] rounded-full bg-white/[0.06] text-xs text-zinc-400 tabular-nums shrink-0">
              <Image src="/Play.svg" alt="" width={13} height={13} className="w-[11px] h-[11px] md:w-[13px] md:h-[13px]" style={{ filter: 'invert(0.55)' }} />
              <span>{formatCount(song.playCount ?? 0)}</span>
            </div>
            <IconBtn src="/Thumb-Up.svg" title="좋아요" filter={ICON_FILTER} active={liked} count={song.likeCount ?? 0} onClick={handleLike} size="sm" />
            <div className="flex items-center gap-1.5 px-2 md:px-2.5 h-[30px] md:h-[35px] rounded-full bg-white/[0.06] text-xs text-zinc-400 tabular-nums shrink-0">
              <Image src="/chat.svg" alt="" width={13} height={13} className="w-[11px] h-[11px] md:w-[13px] md:h-[13px]" style={{ filter: 'invert(0.55)' }} />
              <span>{formatCount(song.commentCount ?? 0)}</span>
            </div>
            <IconBtn src="/Share.svg" title="공유" filter={ICON_FILTER} onClick={handleShare} size="sm" />
            {/* 게시됨 상태만 행에 노출. 호버 시 아이콘 360° 회전 + 텍스트(게시됨↔게시 삭제) 폭이 부드럽게 모핑 */}
            {song.published && (
              <button
                type="button"
                onMouseDown={(e) => { e.stopPropagation(); onUnpublish() }}
                className="h-[30px] md:h-[35px] px-3 md:px-3.5 text-xs rounded-full border bg-white border-white text-zinc-900 hover:bg-zinc-100 transition-colors flex items-center gap-1 md:gap-1.5 group/pub"
              >
                <Image
                  src="/Publish.svg"
                  alt=""
                  width={18}
                  height={18}
                  className="w-4 h-4 md:w-[18px] md:h-[18px] shrink-0 transition-transform duration-500 ease-out group-hover/pub:rotate-[360deg]"
                  style={{ filter: 'invert(0)' }}
                />
                {/* grid 0fr↔1fr 트릭 — 두 텍스트가 동시에 접히고 펴지며 폭이 자연스럽게 변함 */}
                <span className="flex">
                  <span className="grid grid-cols-[1fr] group-hover/pub:grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out">
                    <span className="overflow-hidden whitespace-nowrap">게시됨</span>
                  </span>
                  <span className="grid grid-cols-[0fr] group-hover/pub:grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-out">
                    <span className="overflow-hidden whitespace-nowrap">게시 삭제</span>
                  </span>
                </span>
              </button>
            )}
          </div>
          )}
        </div>
      </div>
    </li>
  )
}

function SongWorkItemSkeleton() {
  // 실제 SongWorkItem 레이아웃과 동일하게 맞춤(구분선 없음·self-start 썸네일·우측 py-0.5·
  // 액션 알약 폭 제각각: 카운트 알약 3 + 공유 정사각 1)
  return (
    <li>
      <div className="px-4 py-3 flex items-stretch gap-3">
        <div className="w-14 md:w-16 aspect-[2/3] rounded-lg shrink-0 self-start bg-white/[0.04] shimmer" />
        <div className="flex-1 min-w-0 flex flex-col py-0.5">
          {/* 제목 행 + 더보기 */}
          <div className="flex items-start gap-2 mb-0 md:mb-1">
            <div className="flex-1 min-w-0">
              <div className="h-[18px] w-2/3 rounded bg-white/[0.04] shimmer" />
              <div className="h-3 w-full rounded bg-white/[0.04] shimmer mt-2" />
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/[0.04] shimmer shrink-0" />
          </div>
          {/* 액션 행 — 재생수·좋아요·댓글(알약) + 공유(정사각) */}
          <div className="flex items-center gap-2 mt-1.5 md:mt-3">
            <div className="h-[30px] md:h-[35px] w-[52px] rounded-full bg-white/[0.04] shimmer shrink-0" />
            <div className="h-[30px] md:h-[35px] w-[52px] rounded-full bg-white/[0.04] shimmer shrink-0" />
            <div className="h-[30px] md:h-[35px] w-[52px] rounded-full bg-white/[0.04] shimmer shrink-0" />
            <div className="w-[30px] h-[30px] md:w-[35px] md:h-[35px] rounded-full bg-white/[0.04] shimmer shrink-0" />
          </div>
        </div>
      </div>
    </li>
  )
}
