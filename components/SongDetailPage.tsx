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
import { profileColor } from '@/utils/profileColor'
import { buildSongShareUrl } from '@/utils/shareUrl'
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
    const shareUrl = buildSongShareUrl(song!.id)
    if (navigator.share) {
      await navigator.share({ title, url: shareUrl }).catch(() => {})
    } else {
      const ok = await navigator.clipboard.writeText(shareUrl).then(() => true).catch(() => false)
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
    // 모바일: top 0 ~ 미니바 위까지만 덮어서 미니바·BottomNav는 그대로 노출
    // 데스크톱: md:relative + md:inset-auto로 일반 flex 아이템처럼 동작
    <div className="fixed inset-x-0 top-0 bottom-[calc(156px+env(safe-area-inset-bottom,0px))] z-[55] bg-[#171A20] flex flex-col overflow-hidden isolate md:relative md:inset-auto md:bottom-auto md:z-auto md:h-full">
      {/* 커버 색감을 흐릿하게 깔아주는 배경 레이어 */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 scale-125 blur-3xl opacity-70 pointer-events-none"
        style={song.coverImage ? undefined : { background: coverGradient(song) }}
      >
        {song.coverImage && (
          <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized priority={false} />
        )}
      </div>
      {/* 가독성용 스크림 — 살짝 진한 색감 보이게 약화 */}
      <div aria-hidden className="absolute inset-0 z-0 bg-[#171A20]/55 pointer-events-none" />

      {/* 데스크톱 헤더 — 모바일은 우상단 닫기 X만 표시 */}
      <div className="hidden md:flex relative z-10 shrink-0 items-center gap-3 px-5 h-14 border-b border-white/[0.06]">
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

      {/* 모바일 닫기 X — 우상단 플로팅 (status bar 아래) */}
      <button
        onClick={onBack}
        title="닫기"
        className="md:hidden absolute right-3 z-20 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur text-white flex items-center justify-center transition-colors"
        style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}
      >
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M1 1l10 10M11 1L1 11"/>
        </svg>
      </button>

      {/* 본문 — 모바일 컬럼, 데스크톱 로우 */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        {/* 좌측(데스크톱) / 상단(모바일) — 커버 + 메타 + 액션 */}
        <div className="shrink-0 md:w-[240px] flex flex-col items-center md:items-stretch p-0 md:p-5 gap-0 md:gap-4">
          {/* 커버 — 모바일: 풀폭 정방형 + 하단 mask fade(배경에 자연 묻어남). 데스크톱: 200px 2:3 */}
          <div
            onClick={togglePlay}
            className="relative w-full aspect-square md:aspect-[2/3] md:rounded-2xl overflow-hidden cursor-pointer group [-webkit-mask-image:linear-gradient(to_bottom,black_72%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_72%,transparent_100%)] md:[-webkit-mask-image:none] md:[mask-image:none]"
            style={{ background: song.coverImage ? undefined : coverGradient(song) }}
          >
            {song.coverImage && (
              <Image src={song.coverImage} alt="" fill className="object-cover" unoptimized />
            )}
            {/* 데스크톱만: 재생 중 dim + 사운드 웨이브 (모바일은 제목 옆에 표시) */}
            {playing ? (
              <div className="hidden md:flex absolute inset-0 bg-black/30 items-center justify-center pointer-events-none">
                <SoundWaveIcon size={40} />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 bg-black/20 opacity-0 group-hover:opacity-100">
                <Image src="/Play.svg" alt="재생" width={36} height={36} style={{ filter: 'invert(1)' }} />
              </div>
            )}
          </div>

          {/* 커버 아래 컨테이너 — 모바일은 mask fade 영역으로 살짝 끌어올림, 좌우 padding 추가 */}
          <div className="relative z-10 flex flex-col items-center md:items-stretch w-full gap-4 px-5 -mt-10 md:mt-0 pb-5 md:p-0">
          {/* 모바일 전용: 커버 바로 아래 제목 가운데 정렬 — 재생 중일 때 좌측에 사운드 웨이브 */}
          <div className="md:hidden flex flex-col items-center gap-1.5 w-full">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {playing && <SoundWaveIcon size={18} />}
              <h2 className="text-xl font-bold text-white leading-snug text-center">{displayTitle}</h2>
              {song.instrumental && (
                <span className="shrink-0 text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-white/[0.06] leading-none">
                  Instrumental
                </span>
              )}
            </div>
          </div>

          {(() => {
            const name = profile?.displayName ?? ownerName ?? user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null
            const hue = profile?.avatarHue ?? (user ? (user.id.charCodeAt(0) * 137) % 360 : 0)
            const avatarUrl = ownerAvatarUrl
            const c = profileColor(hue)
            if (!name) return null
            return (
              <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                {avatarUrl ? (
                  <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
                    <Image src={avatarUrl} alt={name} fill className="object-cover" sizes="32px" unoptimized />
                  </div>
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: c.bg, color: c.text }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-zinc-300 truncate">{name}</span>
                {/* 모바일: 사용자 옆에 시간 같이 (가운데 정렬 그룹) */}
                <span className="md:hidden text-xs text-zinc-500">· {relativeTime(song.createdAt)}</span>
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => setFollowing((v) => !v)}
                    className={`shrink-0 text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
                      following
                        ? 'border border-white text-white bg-transparent hover:bg-white/[0.06]'
                        : 'bg-violet-600 hover:bg-violet-500 text-white'
                    }`}
                  >
                    {following ? '팔로잉' : '팔로우'}
                  </button>
                )}
              </div>
            )
          })()}
          {/* 데스크톱 전용: 시간 별도 줄 */}
          <p className="hidden md:block text-xs text-zinc-500">{relativeTime(song.createdAt)}</p>
          <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
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
          </div> {/* /커버 아래 컨테이너 */}
        </div>

        {/* 우측(데스크톱) / 하단(모바일) — 제목(데스크톱만)·스타일·가사 */}
        <div className="flex-1 md:overflow-y-auto px-5 md:py-5 md:pr-6 md:pl-1 pb-8">
          {/* 제목 — 데스크톱만 (모바일은 좌측 컬럼 커버 아래에) */}
          <div className="hidden md:flex items-center gap-2 mb-6">
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
