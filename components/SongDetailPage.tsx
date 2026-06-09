'use client'

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { SongEditModal } from '@/components/SongEditModal'
import { CollectionPickerModal } from '@/features/song/components/CollectionPickerModal'
import { PublishModal } from '@/features/song/components/PublishModal'
import { collectionService } from '@/services/collection.service'
import { useAuth } from '@/components/AuthProvider'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { toast } from '@/components/toast/toast'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
import { profileColor } from '@/utils/profileColor'
import { buildSongShareUrl } from '@/utils/shareUrl'
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle'
import { track, EVENTS } from '@/utils/analytics'
import { createClient } from '@/lib/supabase/client'
import type { Song } from '@/types/domain'
import { MarqueeText } from '@/components/MarqueeText'
import { CommentsPanel } from '@/components/CommentsPanel'

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
    ownerUserId,
    ownerAvatarUrl,
    ownerAvatarHue,
    ownerName,
    hasPrev,
    hasNext,
    isPlaying: playing,
    togglePlay,
    next: handleNext,
    prev: handlePrev,
    patchSong,
  } = useGlobalPlayer()

  // 모바일 가사·댓글 토글 (데스크톱은 가로 분할로 동시 노출)
  const [tab, setTab] = useState<'lyrics' | 'comments'>('lyrics')

  // 곡 소유자 팔로우 상태 fetch (initial 동기화) — ownerUserId 변경 시마다
  const [followingInitial, setFollowingInitial] = useState(false)
  useEffect(() => {
    if (!user || !ownerUserId || user.id === ownerUserId) { setFollowingInitial(false); return }
    let cancelled = false
    const supabase = createClient()
    supabase.from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('follower_id', user.id)
      .eq('following_id', ownerUserId)
      .then(({ count }) => { if (!cancelled) setFollowingInitial((count ?? 0) > 0) })
    return () => { cancelled = true }
  }, [user?.id, ownerUserId])

  // social-actions §5.3 — 곡 소유자 팔로우 (ownerUserId 기반). 실제 API 호출
  const { state: following, toggle: toggleFollow } = useOptimisticToggle({
    initialState: followingInitial,
    initialCount: 0,
    guard: () => {
      if (!user) { window.dispatchEvent(new Event('open-login')); return false }
      return true
    },
    fetcher: async () => {
      if (!ownerUserId) throw new Error('no owner')
      const r = await fetch(`/api/profiles/${ownerUserId}/follow`, { method: 'POST' })
      if (!r.ok) {
        if (r.status === 401) window.dispatchEvent(new Event('open-login'))
        throw new Error('follow failed')
      }
      const d = await r.json()
      // Plan SC FR-06: 팔로우 성공 시 creator_follow (source: 'song_detail')
      if (d.following && ownerUserId) {
        track(EVENTS.CREATOR_FOLLOW, { source: 'song_detail', target_user_id: ownerUserId })
      }
      return { state: d.following }
    },
    onError: () => toast.error('팔로우에 실패했어요'),
  })
  const [collectOpen, setCollectOpen] = useState(false)
  const [inCollection, setInCollection] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const [liked, setLiked] = useState(song?.liked ?? false)

  // 댓글 작성/삭제 시 액션 행 댓글 수 즉시 갱신
  useEffect(() => {
    function onChange(e: Event) {
      const { songId, delta } = (e as CustomEvent<{ songId: string; delta: number }>).detail
      if (song?.id === songId) {
        patchSong?.({ commentCount: Math.max(0, (song.commentCount ?? 0) + delta) })
      }
    }
    window.addEventListener('song-comment-count-changed', onChange)
    return () => window.removeEventListener('song-comment-count-changed', onChange)
  }, [song?.id, song?.commentCount, patchSong])

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

  // 좋아요: isOwner에 따라 두 의미가 다름
  const likeInflight = useRef(false)
  async function handleLike() {
    if (likeInflight.current) return
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    likeInflight.current = true
    const prev = liked
    const prevCount = song!.likeCount ?? 0
    const next = !prev
    setLiked(next)
    patchSong({ liked: next, likeCount: prevCount + (next ? 1 : -1) })
    try {
      const r = await fetch(`/api/songs/${song!.id}/like`, { method: 'POST' })
      if (!r.ok) {
        if (r.status === 401) window.dispatchEvent(new Event('open-login'))
        throw new Error('like failed')
      }
      const d = await r.json()
      setLiked(d.liked)
      patchSong({ liked: d.liked, likeCount: d.likeCount })
      window.dispatchEvent(new CustomEvent('like-updated', { detail: { songId: song!.id, liked: d.liked, likeCount: d.likeCount } }))
    } catch {
      setLiked(prev)
      patchSong({ liked: prev, likeCount: prevCount })
      toast.error('좋아요 처리에 실패했어요')
    } finally {
      likeInflight.current = false
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
    <div className="fixed inset-x-0 top-0 bottom-[calc(148px+env(safe-area-inset-bottom,0px))] z-[55] bg-[#171A20] flex flex-col overflow-hidden isolate md:relative md:inset-auto md:bottom-auto md:z-auto md:h-full">
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
      <div aria-hidden className="absolute inset-0 z-0 bg-[#171A20]/75 pointer-events-none" />

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
              <div className="hidden md:block absolute bottom-3 left-3 pointer-events-none">
                <SoundWaveIcon size={24} />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-end transition-opacity duration-150 opacity-0 group-hover:opacity-100">
                <div className="p-3">
                  <Image src="/Play.svg" alt="재생" width={22} height={22} style={{ filter: 'invert(1)' }} />
                </div>
              </div>
            )}
          </div>

          {/* 커버 아래 컨테이너 — 모바일은 mask fade 영역으로 살짝 끌어올림, 좌우 padding 추가 */}
          <div className="relative z-10 flex flex-col items-stretch w-full gap-4 px-5 -mt-10 md:mt-0 pb-5 md:p-0">
          {/* 모바일 전용: 커버 바로 아래 제목 — 긴 제목은 마퀴 롤링 */}
          <div className="md:hidden flex items-center gap-2 w-full min-w-0">
            <MarqueeText
              text={displayTitle}
              className="text-2xl font-bold text-white leading-snug flex-1 min-w-0"
            />
            {song.instrumental && (
              <span className="shrink-0 text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-white/[0.06] leading-none">
                Inst.
              </span>
            )}
          </div>

          {/* 모바일 전용: 프로필 + 팔로우 */}
          {(() => {
            const name = ownerName ?? profile?.displayName ?? user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null
            const hue = ownerAvatarHue ?? profile?.avatarHue ?? 0
            const avatarUrl = ownerAvatarUrl
            const c = profileColor(hue)
            if (!name) return null
            return (
              <div className="md:hidden flex items-center gap-2 flex-wrap justify-start">
                {avatarUrl ? (
                  <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0">
                    <Image src={avatarUrl} alt={name} fill className="object-cover" sizes="36px" unoptimized />
                  </div>
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: c.bg, color: c.text }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-white truncate">{name}</span>
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => toggleFollow()}
                    aria-pressed={following}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/[0.08] text-white hover:bg-white/[0.12] transition-colors"
                  >
                    <Image src={following ? '/Following.svg' : '/Follow.svg'} alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
                    {following ? '팔로잉' : '팔로우'}
                  </button>
                )}
              </div>
            )
          })()}
          {/* 모바일 전용: 코멘트 */}
          {song.publishComment && (
            <p className="md:hidden text-sm text-white leading-relaxed whitespace-pre-wrap">{song.publishComment}</p>
          )}
          {/* 모바일 전용: 스타일 — 프로필과 아이콘 사이 */}
          <div className="md:hidden relative">
            <div className="absolute top-0 right-0"><CopyBtn text={song.prompt} /></div>
            <p className="text-sm text-zinc-400 leading-relaxed pr-8">{song.prompt}</p>
          </div>

          {/* 모바일 전용: 액션 버튼 */}
          <div className="md:hidden flex items-center gap-2 flex-wrap justify-start">
            <div className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-white/[0.08]">
              <Image src="/Play.svg" alt="재생수" width={16} height={16} style={{ filter: 'invert(0.55)' }} />
              <span className="text-xs font-medium text-zinc-400 tabular-nums">{formatCount(song.playCount ?? 0)}</span>
            </div>
            <ActionBtn title="좋아요" icon="/Thumb-Up.svg" active={liked} count={song.likeCount ?? 0} onClick={handleLike} />
            <div className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-white/[0.08]">
              <Image src="/chat.svg" alt="댓글수" width={16} height={16} style={{ filter: 'invert(0.55)' }} />
              <span className="text-xs font-medium text-zinc-400 tabular-nums">{formatCount(song.commentCount ?? 0)}</span>
            </div>
            <ActionBtn title="공유" icon="/Share.svg" onClick={handleShare} />
            <SongMoreMenu
              isOwner={isOwner}
              inCollection={inCollection}
              onCollect={() => setCollectOpen(true)}
              onEdit={isOwner ? () => setEditOpen(true) : undefined}
              onDelete={isOwner ? () => setConfirmDelete(true) : undefined}
              onPublish={isOwner && !song.published ? () => setPublishOpen(true) : undefined}
              onUnpublish={isOwner && song.published ? () => setConfirmUnpublish(true) : undefined}
            />
          </div>
          </div> {/* /커버 아래 컨테이너 */}
        </div>

        {/* 우측(데스크톱) / 하단(모바일) — 데스크톱: 가사 옆 댓글 / 모바일: 가사·댓글 토글. gap 최소화로 좌측 스크롤바를 댓글 패널 경계에 붙임 */}
        <div className="flex-1 px-5 md:py-5 md:pr-6 md:pl-1 pb-8 md:flex md:flex-row md:gap-0 md:overflow-hidden">
          {/* 좌측 패널: 헤더 + 가사 (모바일에선 가사 탭일 때만). md:pr-3 — 복사 버튼이 스크롤바와 겹치지 않도록 */}
          <div className={`md:flex-1 md:min-w-0 md:overflow-y-auto md:pr-3 ${tab === 'comments' ? 'hidden md:block' : ''}`}>
            {/* 모바일 가사·댓글 토글 (공개 곡일 때만 댓글 노출) */}
            {song.published && (
              <div className="md:hidden mb-4">
                <div className="inline-flex rounded-full bg-white/[0.06] p-1">
                  {(['lyrics', 'comments'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                      className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-white'}`}>
                      {t === 'lyrics' ? '가사' : '댓글'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          {/* 제목·프로필·스타일·날짜 + 액션 — 데스크톱만, justify-between으로 아이콘을 커버 하단에 정렬 */}
          <div className="hidden md:flex flex-col justify-between gap-6 min-h-[300px] mb-6">
            <div className="flex flex-col gap-4">
              {/* 제목 */}
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-white leading-snug">{displayTitle}</h2>
                {song.instrumental && (
                  <span className="shrink-0 text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded border border-white/[0.06] leading-none">
                    Inst.
                  </span>
                )}
              </div>
              {/* 프로필 + 팔로우 */}
              {(() => {
                const name = ownerName ?? profile?.displayName ?? user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null
                const hue = ownerAvatarHue ?? profile?.avatarHue ?? 0
                const avatarUrl = ownerAvatarUrl
                const c = profileColor(hue)
                if (!name) return null
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    {avatarUrl ? (
                      <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0">
                        <Image src={avatarUrl} alt={name} fill className="object-cover" sizes="36px" unoptimized />
                      </div>
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: c.bg, color: c.text }}
                      >
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm text-white truncate">{name}</span>
                    {!isOwner && (
                      <button
                        type="button"
                        onClick={() => toggleFollow()}
                        aria-pressed={following}
                        className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/[0.08] text-white hover:bg-white/[0.12] transition-colors"
                      >
                        <Image src={following ? '/Following.svg' : '/Follow.svg'} alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
                        {following ? '팔로잉' : '팔로우'}
                      </button>
                    )}
                  </div>
                )
              })()}
              {/* 코멘트 */}
              {song.publishComment && (
                <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{song.publishComment}</p>
              )}
              {/* 스타일 */}
              <div className="relative">
                <div className="absolute top-0 right-0"><CopyBtn text={song.prompt} /></div>
                <p className="text-sm text-zinc-400 leading-relaxed pr-8">{song.prompt}</p>
              </div>
              {/* 날짜 */}
              <p className="text-xs text-zinc-400">{relativeTime(song.createdAt)}</p>
            </div>
            {/* 액션 버튼 */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-white/[0.08]">
                <Image src="/Play.svg" alt="재생수" width={16} height={16} style={{ filter: 'invert(0.55)' }} />
                <span className="text-xs font-medium text-zinc-400 tabular-nums">{formatCount(song.playCount ?? 0)}</span>
              </div>
              <ActionBtn title="좋아요" icon="/Thumb-Up.svg" active={liked} count={song.likeCount ?? 0} onClick={handleLike} />
              <div className="flex items-center gap-1.5 px-3 h-10 rounded-full bg-white/[0.08]">
                <Image src="/chat.svg" alt="댓글수" width={16} height={16} style={{ filter: 'invert(0.55)' }} />
                <span className="text-xs font-medium text-zinc-400 tabular-nums">{formatCount(song.commentCount ?? 0)}</span>
              </div>
              <ActionBtn title="공유" icon="/Share.svg" onClick={handleShare} />
              <SongMoreMenu
                isOwner={isOwner}
                inCollection={inCollection}
                onCollect={() => setCollectOpen(true)}
                onEdit={isOwner ? () => setEditOpen(true) : undefined}
                onDelete={isOwner ? () => setConfirmDelete(true) : undefined}
                onPublish={isOwner && !song.published ? () => setPublishOpen(true) : undefined}
                onUnpublish={isOwner && song.published ? () => setConfirmUnpublish(true) : undefined}
              />
            </div>
          </div>

          {song.lyrics && (
            <div className="relative">
              <div className="absolute top-0 right-0"><CopyBtn text={song.lyrics} /></div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-[1.9] font-[family-name:var(--font-pretendard)] pr-8">
                {song.lyrics}
              </p>
            </div>
          )}
          </div>

          {/* 우측 패널: 댓글 — 데스크톱은 고정 폭. md:-mr-6 (외부 pr-6 상쇄) + md:pr-3 (스크롤바와 컨텐츠 분리). 모바일에선 댓글 탭일 때만 */}
          <div className={`md:w-[500px] md:shrink-0 md:overflow-y-auto md:border-l md:border-white/[0.06] md:pl-5 md:pr-3 md:-mr-6 ${tab === 'lyrics' ? 'hidden md:block' : ''}`}>
            {song.published && (
              <div className="md:hidden mb-4">
                <div className="inline-flex rounded-full bg-white/[0.06] p-1">
                  {(['lyrics', 'comments'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                      className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-white'}`}>
                      {t === 'lyrics' ? '가사' : '댓글'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <CommentsPanel
              songId={song.id}
              songOwnerId={ownerUserId ?? null}
              songIsPublic={!!song.published}
            />
          </div>
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

      {confirmDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
            <p className="text-sm font-semibold text-white mb-1">삭제하시겠어요?</p>
            <p className="text-xs text-zinc-400 mb-5 truncate">"{displayTitle}"</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">아니요</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">네</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {publishOpen && song && (
        <PublishModal song={song} onClose={() => setPublishOpen(false)} />
      )}

      {confirmUnpublish && song && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmUnpublish(false)} />
          <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl">
            <p className="text-sm font-semibold text-white mb-1">게시를 취소하시겠어요?</p>
            <p className="text-xs text-zinc-400 mb-5">게시 취소하면 더이상 탐색과 프로필, 검색에서 노출되지 않아요.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmUnpublish(false)} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors">취소</button>
              <button
                onClick={() => {
                  songService.update(song.id, { published: false, publishedAt: undefined })
                  patchSong?.({ published: false, publishedAt: undefined })
                  setConfirmUnpublish(false)
                  window.dispatchEvent(new CustomEvent('song-updated'))
                  toast.info('게시가 취소되었어요')
                }}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                게시 삭제
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function formatCount(n: number) {
  if (n >= 10000) return `${+(n / 10000).toFixed(1)}만`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
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
      className="p-1 rounded transition-colors hover:bg-white/[0.06]"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      ) : (
        <Image src="/Copy.svg" alt="복사" width={15} height={15} style={{ filter: 'invert(0.63)' }} />
      )}
    </button>
  )
}

function ActionBtn({ title, icon, active, count, onClick }: { title: string; icon: string; active?: boolean; count?: number; onClick?: () => void }) {
  const hasCount = count !== undefined
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 h-10 rounded-full transition-colors ${
        hasCount ? 'px-3' : 'w-10'
      } ${
        active ? 'bg-white hover:bg-zinc-100' : 'bg-white/[0.08] hover:bg-white/[0.12]'
      }`}
    >
      <Image src={icon} alt={title} width={18} height={18} style={{ filter: active ? 'invert(0)' : 'invert(0.55)' }} />
      {hasCount && (
        <span className={`text-xs font-medium tabular-nums ${active ? 'text-black' : 'text-zinc-400'}`}>
          {formatCount(count)}
        </span>
      )}
    </button>
  )
}

function SongMoreMenu({ isOwner, inCollection, onCollect, onPublish, onUnpublish, onEdit, onDelete }: {
  isOwner: boolean
  inCollection: boolean
  onCollect: () => void
  onPublish?: () => void
  onUnpublish?: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
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
        <div className="absolute right-0 bottom-full mb-2 bg-[#282D38] border border-white/[0.08] rounded-xl py-1 min-w-[140px] shadow-xl z-20">
          <button onClick={() => { setOpen(false); onCollect() }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-white/[0.06] transition-colors ${inCollection ? 'text-violet-400' : 'text-white'}`}>
            <Image src="/Collection.svg" alt="" width={14} height={14} style={{ filter: inCollection ? 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)' : 'invert(0.55)' }} /> 컬렉션
          </button>
          {isOwner && (
            <>
              <div className="my-1 h-px bg-white/[0.06]" />
              {onPublish && (
                <button onClick={() => { setOpen(false); onPublish() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors">
                  <Image src="/Publish.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.55)' }} /> 게시하기
                </button>
              )}
              {onUnpublish && (
                <button onClick={() => { setOpen(false); onUnpublish() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors">
                  <Image src="/Publish.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.55)' }} /> 게시 취소
                </button>
              )}
              <button onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'sidebar' })) }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors">
                <Image src="/Arrow-To-Down.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.55)' }} /> 저장
              </button>
              <div className="my-1 h-px bg-white/[0.06]" />
              {onEdit && (
                <button onClick={() => { setOpen(false); onEdit() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors">
                  <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.55)' }} /> 편집
                </button>
              )}
              {onDelete && (
                <button onClick={() => { setOpen(false); onDelete() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                  <Image src="/Delete-2.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 삭제
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
