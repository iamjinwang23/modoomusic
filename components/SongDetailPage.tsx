'use client'

import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import { CollectionPickerModal } from '@/features/song/components/CollectionPickerModal'
import { collectionService } from '@/services/collection.service'
import { useAuth } from '@/components/AuthProvider'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { toast } from '@/components/toast/toast'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
import type { Song } from '@/types/domain'

interface SongProfile {
  displayName: string
  username: string
  avatarHue?: number
}

interface Props {
  onBack: () => void
  profile?: SongProfile
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  const week = Math.floor(day / 7)
  if (week < 5) return `${week}주 전`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month}개월 전`
  return `${Math.floor(day / 365)}년 전`
}

function coverGradient(song: Song) {
  const hue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  return `linear-gradient(160deg, hsl(${hue},70%,50%) 0%, hsl(${h2},60%,35%) 60%, hsl(${(h2 + 40) % 360},50%,24%) 100%)`
}

export function SongDetailPage({ onBack, profile }: Props) {
  const { user } = useAuth()
  const {
    song,
    isOwner,
    ownerAvatarUrl,
    ownerName,
    hasPrev,
    hasNext,
    isPlaying: playing,
    togglePlay,
    next: handleNext,
    prev: handlePrev,
    patchSong,
  } = useGlobalPlayer()

  const [following, setFollowing] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [inCollection, setInCollection] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [liked, setLiked] = useState(song?.liked ?? false)

  // Sync liked state when song changes
  useEffect(() => {
    setLiked(song?.liked ?? false)
  }, [song?.id, song?.liked])

  // Sync inCollection state when song changes
  useEffect(() => {
    if (!song) return
    setInCollection(collectionService.getSongCollectionIds(song.id).length > 0)
  }, [song?.id])

  useEffect(() => {
    if (!song) return
    function handler() {
      if (!song) return
      setInCollection(collectionService.getSongCollectionIds(song.id).length > 0)
    }
    window.addEventListener('collection-updated', handler)
    return () => window.removeEventListener('collection-updated', handler)
  }, [song?.id])

  if (!song) return null

  const displayTitle = song.title || 'Untitled'

  function handleLike() {
    const next = !liked
    setLiked(next)
    patchSong({ liked: next })
    if (isOwner) {
      songService.update(song!.id, { liked: next })
      window.dispatchEvent(new CustomEvent('song-updated'))
    }
  }

  async function handleShare() {
    const title = song!.title || song!.prompt.slice(0, 40)
    if (navigator.share) {
      await navigator.share({ title, url: song!.audioUrl }).catch(() => {})
    } else {
      const ok = await navigator.clipboard.writeText(song!.audioUrl).then(() => true).catch(() => false)
      if (ok) toast.success('링크가 복사되었어요')
      else toast.error('링크 복사에 실패했어요')
    }
  }

  function handleDelete() {
    if (isOwner) {
      const snapshot = songService.delete(song!.id)
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
    setConfirmDelete(false)
    onBack()
  }

  return (
    <div className="relative isolate flex flex-col h-full overflow-hidden">
      {/* 커버 색감을 흐릿하게 깔아주는 배경 레이어 */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 scale-125 blur-3xl opacity-40 pointer-events-none"
        style={song.coverImage ? undefined : { background: coverGradient(song) }}
      >
        {song.coverImage && (
          <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized priority={false} />
        )}
      </div>
      {/* 가독성용 스크림 */}
      <div aria-hidden className="absolute inset-0 z-0 bg-[#171A20]/75 pointer-events-none" />

      {/* 헤더 */}
      <div className="relative z-10 shrink-0 flex items-center gap-3 px-5 h-14 border-b border-white/[0.06]">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1L1 6.5 7 12" />
          </svg>
        </button>
        <p className="text-sm font-medium text-white truncate">{displayTitle}</p>
      </div>

      {/* 본문 */}
      <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">
        {/* 좌측 — 커버 + 액션 */}
        <div className="w-[240px] shrink-0 flex flex-col p-5 gap-4">
          <div
            onClick={togglePlay}
            className="relative w-full rounded-2xl overflow-hidden cursor-pointer group"
            style={{ background: song.coverImage ? undefined : coverGradient(song), aspectRatio: '2 / 3' }}
          >
            {song.coverImage && (
              <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized />
            )}
            {/* 재생 중: 은은한 dim + 사운드 웨이브 / 정지: hover 시 play */}
            {playing ? (
              <>
                <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <SoundWaveIcon size={40} />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 bg-black/20 opacity-0 group-hover:opacity-100">
                <Image src="/Play.svg" alt="재생" width={36} height={36} style={{ filter: 'invert(1)' }} />
              </div>
            )}
          </div>
          {(() => {
            const name = profile?.displayName ?? ownerName ?? user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null
            const hue = profile?.avatarHue ?? (user ? (user.id.charCodeAt(0) * 137) % 360 : 0)
            const avatarUrl = ownerAvatarUrl
            if (!name) return null
            return (
              <div className="flex items-center gap-2">
                {avatarUrl ? (
                  <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
                    <Image src={avatarUrl} alt={name} fill className="object-cover" sizes="32px" unoptimized />
                  </div>
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: `hsl(${hue},60%,45%)` }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-zinc-300 truncate">{name}</span>
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => setFollowing((v) => !v)}
                    className={`shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
                      following
                        ? 'bg-white/[0.08] text-zinc-400 hover:bg-white/[0.12]'
                        : 'bg-violet-600 hover:bg-violet-500 text-white'
                    }`}
                  >
                    {following ? '팔로잉' : '팔로우'}
                  </button>
                )}
              </div>
            )
          })()}
          <p className="text-xs text-zinc-500">{relativeTime(song.createdAt)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionBtn title="좋아요" icon="/Thumb-Up.svg" active={liked} onClick={handleLike} />
            <ActionBtn title="컬렉션" icon="/Collection.svg" active={inCollection} onClick={() => setCollectOpen(true)} />
            <ActionBtn title="공유" icon="/Share.svg" onClick={handleShare} />
            <ActionBtn title="저장" icon="/Arrow-To-Down.svg" />
            {isOwner && (
              <OwnerMenu
                onEdit={() => setEditOpen(true)}
                onDelete={() => setConfirmDelete(true)}
              />
            )}
          </div>
        </div>

        {/* 우측 — 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto py-5 pr-6 pl-1">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-2xl font-bold text-white leading-snug">{displayTitle}</h2>
            {song.instrumental && (
              <span className="shrink-0 text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded border border-white/[0.06] leading-none">
                Instrumental
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">스타일</p>
            <CopyBtn text={song.prompt} />
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed mb-4">{song.prompt}</p>

          {song.publishComment && (
            <p className="text-sm text-white leading-relaxed mb-8 whitespace-pre-wrap">{song.publishComment}</p>
          )}

          {song.mood && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              <span className="text-xs text-zinc-400 bg-zinc-800 px-2.5 py-0.5 rounded-full border border-white/[0.06]">
                {song.mood}
              </span>
            </div>
          )}

          {song.lyrics && (
            <>
              <div className="flex items-center gap-1.5 mb-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">가사</p>
                <CopyBtn text={song.lyrics} />
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-[1.9] font-[family-name:var(--font-pretendard)]">
                {song.lyrics}
              </p>
            </>
          )}
        </div>
      </div>

      {collectOpen && (
        <CollectionPickerModal song={song} onClose={() => setCollectOpen(false)} />
      )}

      {editOpen && (
        <SongEditModal
          song={song}
          onClose={() => setEditOpen(false)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
            <p className="text-sm font-semibold text-white mb-1">삭제하시겠어요?</p>
            <p className="text-xs text-zinc-400 mb-5 truncate">"{displayTitle}"</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">아니요</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">네</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      toast.success('복사되었어요')
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => toast.error('복사에 실패했어요'))
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="복사"
      className="p-1 rounded transition-opacity opacity-40 hover:opacity-100"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      ) : (
        <Image src="/Copy.svg" alt="복사" width={15} height={15} style={{ filter: 'invert(0.6)' }} />
      )}
    </button>
  )
}

function ActionBtn({ title, icon, active, onClick }: { title: string; icon: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-white hover:bg-zinc-100' : 'bg-white/[0.06] hover:bg-white/[0.12]'
      }`}
    >
      <Image src={icon} alt={title} width={18} height={18} style={{ filter: active ? 'invert(0)' : 'invert(0.55)' }} />
    </button>
  )
}

function OwnerMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
      >
        <Image src="/More.svg" alt="더보기" width={18} height={18} style={{ filter: 'invert(0.55)' }} />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-2 bg-[#282D38] border border-white/[0.08] rounded-xl py-1 min-w-[110px] shadow-xl z-20">
          <button onClick={() => { setOpen(false); onEdit() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors">
            <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.55)' }} /> 편집
          </button>
          <button onClick={() => { setOpen(false); onDelete() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
            <Image src="/Delete-2.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 삭제
          </button>
        </div>
      )}
    </div>
  )
}
