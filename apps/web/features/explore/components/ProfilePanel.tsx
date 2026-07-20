'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ConfirmModal'
import { exploreService } from '@/services/explore.service'
import { songService } from '@/services/song.service'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import { ProfileEditModal } from '@/components/ProfileEditModal'
import { SocialLinksRow } from '@/components/SocialLinksRow'
import { toast } from '@/components/toast/toast'
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle'
import { track, EVENTS } from '@/utils/analytics'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
import { VideoCoverPlayer } from '@/components/VideoCoverPlayer'
import type { PublicSong, Song, UserProfile, SocialLinks } from '@mono/shared'
import { profileColor } from '@/utils/profileColor'
import { toWebp } from '@/utils/imageUpload'
import { CropModal } from '@/components/CropModal'

function coverGradient(hue: number) {
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function ProfileSongThumb({ song, onPlay, onThumbPlay }: { song: PublicSong; onPlay: (s: PublicSong) => void; onThumbPlay: (s: PublicSong) => void }) {
  const { song: currentSong, isPlaying } = useGlobalPlayer()
  const isThisPlaying = currentSong?.id === song.id && isPlaying
  return (
    <div
      onClick={() => onThumbPlay(song)}
      className="relative aspect-[2/3] cursor-pointer overflow-hidden bg-zinc-900"
    >
      <div className="absolute inset-0" style={{ background: coverGradient(song.coverHue) }}>
        {(song.videoCoverUrl || song.coverImage) && (
          <VideoCoverPlayer
            videoCoverUrl={isThisPlaying && song.videoCoverStatus === 'done' ? song.videoCoverUrl : undefined}
            fallbackImageUrl={song.coverImage}
            sizes="(min-width: 768px) 16vw, 33vw"
          />
        )}
      </div>
      {isThisPlaying && !(song.videoCoverStatus === 'done' && song.videoCoverUrl) && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <SoundWaveIcon size={24} />
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-2 text-white text-[11px] font-medium drop-shadow">
        <span className="flex items-center gap-0.5">
          <Image src="/Thumb-Up.svg" alt="" width={10} height={10} style={{ filter: 'invert(1)' }} />
          {formatCount(song.likeCount)}
        </span>
        <span className="flex items-center gap-0.5">
          <Image src="/chat.svg" alt="" width={10} height={10} style={{ filter: 'invert(1)' }} />
          {formatCount(song.commentCount)}
        </span>
        <span className="flex items-center gap-0.5">
          <Image src="/Play.svg" alt="" width={10} height={10} style={{ filter: 'invert(1)' }} />
          {formatCount(song.playCount)}
        </span>
      </div>
      {/* 가장자리 라인 — 좌측 패널 라인색 */}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.08]" />
    </div>
  )
}

function toSong(pub: PublicSong): Song {
  return {
    id: pub.id,
    createdAt: pub.createdAt,
    title: pub.title,
    prompt: pub.prompt,
    genre: pub.genre,
    mood: pub.mood,
    customLyrics: null,
    lyrics: pub.lyrics,
    instrumental: pub.instrumental,
    audioUrl: pub.audioUrl,
    duration: pub.duration ?? null,
    liked: pub.isLiked,
    coverHue: pub.coverHue,
    coverImage: pub.coverImage,
    playCount: pub.playCount,
    likeCount: pub.likeCount,
    commentCount: pub.commentCount,
    publishComment: pub.publishComment,
    published: pub.published,
    model: pub.model,
    videoCoverUrl: pub.videoCoverUrl,
    videoCoverStatus: pub.videoCoverStatus,
  }
}

// ── 이미지 업로드 유틸 ────────────────────────────────────────────
const MAX_PX = { avatar: 400, cover: 1200 }

async function uploadProfileImage(
  userId: string,
  fileOrBlob: File | Blob,
  type: 'avatar' | 'cover',
): Promise<string | null> {
  const supabase = createClient()
  // Blob(이미 WebP, CropModal에서 옴)이면 그대로, File이면 toWebp
  const blob = fileOrBlob instanceof File
    ? await toWebp(fileOrBlob, MAX_PX[type])
    : fileOrBlob
  const path = `${userId}/${type}.webp`
  const { error } = await supabase.storage
    .from('profile-images')
    .upload(path, blob, { upsert: true, contentType: 'image/webp', cacheControl: '31536000, immutable' })
  if (error) { console.error('[profile upload]', error.message); return null }
  const baseUrl = supabase.storage.from('profile-images').getPublicUrl(path).data.publicUrl
  return `${baseUrl}?v=${Date.now()}`
}

async function deleteProfileImage(userId: string, type: 'avatar' | 'cover') {
  const supabase = createClient()
  await supabase.storage.from('profile-images').remove([`${userId}/${type}.webp`])
}

// ── 이미지 호버 오버레이 ──────────────────────────────────────────
function ImageEditOverlay({ onUpload, onDelete, hasImage }: {
  onUpload: (file: File) => void
  onDelete?: () => void
  hasImage: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur flex items-center justify-center transition-colors"
        title={hasImage ? '변경' : '업로드'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
      {hasImage && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="w-9 h-9 rounded-full bg-red-500/70 hover:bg-red-500/90 backdrop-blur flex items-center justify-center transition-colors"
          title="삭제"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }}
      />
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
interface Props { username: string }

export function ProfilePanel({ username }: Props) {
  const { user, profile: authProfile } = useAuth()
  // 본인인지 판별: 내 username과 prop username 비교
  const isSelf = !!user && authProfile?.username === username

  const publishedCount = isSelf
    ? songService.getAll().filter((s) => s.published).length
    : 0

  // 본인 프로필: 추가 컬럼(bio·links·변경 정책) 로드
  const [dbProfile, setDbProfile] = useState<{
    username: string
    displayName: string | null
    bio: string | null
    avatarHue: number
    followerCount: number
    followingCount: number
    links: SocialLinks
    usernameChangedAt: string | null
    nameChangeLog: string[]
  } | null>(null)

  // 다른 사용자 프로필 + 그 사용자의 공개 곡 (Supabase에서 fetch)
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null)
  const [otherSongs, setOtherSongs] = useState<PublicSong[]>([])
  const [loadingOther, setLoadingOther] = useState(!isSelf)

  useEffect(() => {
    if (!isSelf || !user) { setDbProfile(null); return }
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('username, display_name, bio, avatar_hue, follower_count, following_count, link_instagram, link_tiktok, link_youtube, link_facebook, link_x, username_changed_at, name_change_log')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setDbProfile(null); return }
        setDbProfile({
          username: data.username,
          displayName: data.display_name,
          bio: data.bio,
          avatarHue: data.avatar_hue ?? 0,
          followerCount: data.follower_count ?? 0,
          followingCount: data.following_count ?? 0,
          links: {
            instagram: data.link_instagram,
            tiktok:    data.link_tiktok,
            youtube:   data.link_youtube,
            facebook:  data.link_facebook,
            x:         data.link_x,
          },
          usernameChangedAt: data.username_changed_at ?? null,
          nameChangeLog: (data.name_change_log ?? []) as string[],
        })
      })
  }, [isSelf, user?.id])

  useEffect(() => {
    // isSelf 분기 제거 — 본인 프로필도 getUserSongs로 like/play count 정확히 가져오기
    // (이전엔 selfSongs를 로컬 cache에서 만들면서 likeCount/playCount/isLiked를 0/false로 하드코딩했음)
    let cancelled = false
    setLoadingOther(true)
    Promise.all([
      exploreService.getProfile(username, user?.id ?? null),
      exploreService.getUserSongs(username),
    ]).then(([p, songs]) => {
      if (cancelled) return
      setOtherProfile(p)
      setOtherSongs(songs)
      setLoadingOther(false)
    })
    return () => { cancelled = true }
  }, [username, user?.id])

  useEffect(() => {
    function handler(e: Event) {
      const { songId, liked, likeCount } = (e as CustomEvent<{ songId: string; liked: boolean; likeCount: number }>).detail
      setOtherSongs(prev => prev.map(s => s.id === songId ? { ...s, isLiked: liked, likeCount } : s))
    }
    window.addEventListener('like-updated', handler)
    return () => window.removeEventListener('like-updated', handler)
  }, [])

  const selfProfile: UserProfile | null = isSelf && user && dbProfile && dbProfile.username === username
    ? {
        username: dbProfile.username,
        displayName: dbProfile.displayName ?? dbProfile.username,
        userId: user.id,
        bio: dbProfile.bio,
        avatarHue: dbProfile.avatarHue,
        followerCount: dbProfile.followerCount,
        followingCount: dbProfile.followingCount,
        songCount: publishedCount,
        links: dbProfile.links,
      }
    : null

  function patchDbProfile(patch: Partial<NonNullable<typeof dbProfile>>) {
    setDbProfile((prev) => prev ? { ...prev, ...patch } : prev)
  }

  // DB에서 실제 이미지 URL 로드
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null)
  const [avatarHovered, setAvatarHovered] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  // 모달 편집 이미지 스테이징 — 저장 시에만 storage 업로드 + DB 커밋, 취소 시 스냅샷 복원.
  // (인라인 배너 즉시 편집은 예외 — handleAvatarUpload/handleCoverUpload 유지)
  const imgSnapshotRef = useRef<{ avatar: string | null; cover: string | null }>({ avatar: null, cover: null })
  const pendingAvatarRef = useRef<File | Blob | 'delete' | null>(null)
  const pendingCoverRef = useRef<File | Blob | 'delete' | null>(null)
  // CropModal — 모든 upload entry를 인터셉트
  const [cropState, setCropState] = useState<{ file: File; type: 'avatar' | 'cover'; mode: 'inline' | 'stage' } | null>(null)

  useEffect(() => {
    if (!isSelf || !user) return
    const supabase = createClient()
    supabase.from('profiles').select('avatar_url, cover_url').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) { setAvatarUrl(data.avatar_url); setCoverUrl(data.cover_url) }
      })
  }, [isSelf, user?.id])

  function handleAvatarUpload(file: File) {
    setCropState({ file, type: 'avatar', mode: 'inline' })
  }

  async function doAvatarUploadInline(blob: Blob) {
    if (!user) return
    setUploading('avatar')
    const url = await uploadProfileImage(user.id, blob, 'avatar')
    if (url) {
      setAvatarUrl(url)
      await createClient().from('profiles').update({ avatar_url: url }).eq('id', user.id)
      window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: url }))
      toast.success('프로필 사진이 변경되었어요')
    } else {
      toast.error('사진 업로드에 실패했어요')
    }
    setUploading(null)
  }

  // ── 모달 편집 스테이징 (저장 시 커밋) ──
  function handleAvatarStage(file: File) {
    setCropState({ file, type: 'avatar', mode: 'stage' })
  }
  function handleAvatarDelete() {
    pendingAvatarRef.current = 'delete'
    setAvatarUrl(null)
  }

  function handleCoverUpload(file: File) {
    setCropState({ file, type: 'cover', mode: 'inline' })
  }

  async function doCoverUploadInline(blob: Blob) {
    if (!user) return
    setUploading('cover')
    const url = await uploadProfileImage(user.id, blob, 'cover')
    if (url) {
      setCoverUrl(url)
      await createClient().from('profiles').update({ cover_url: url }).eq('id', user.id)
      toast.success('커버 이미지가 변경되었어요')
    } else {
      toast.error('커버 업로드에 실패했어요')
    }
    setUploading(null)
  }

  function handleCoverStage(file: File) {
    setCropState({ file, type: 'cover', mode: 'stage' })
  }

  // CropModal confirm 라우터
  function handleCropConfirm(blob: Blob) {
    if (!cropState) return
    const { type, mode } = cropState
    if (mode === 'inline') {
      type === 'avatar' ? doAvatarUploadInline(blob) : doCoverUploadInline(blob)
    } else {
      if (type === 'avatar') {
        pendingAvatarRef.current = blob
        setAvatarUrl(URL.createObjectURL(blob))
      } else {
        pendingCoverRef.current = blob
        setCoverUrl(URL.createObjectURL(blob))
      }
    }
    setCropState(null)
  }
  function handleCoverDelete() {
    pendingCoverRef.current = 'delete'
    setCoverUrl(null)
  }

  const profile = isSelf ? selfProfile : otherProfile

  // social-actions §5.3 — 팔로우 토글: 낙관적 UI + followerCount 즉시 갱신
  const { state: following, count: followerCount, toggle: toggleFollow } = useOptimisticToggle({
    initialState: profile?.isFollowing ?? false,
    initialCount: profile?.followerCount ?? 0,
    guard: () => {
      if (!user) { window.dispatchEvent(new Event('open-login')); return false }
      return true
    },
    fetcher: async () => {
      if (!profile) throw new Error('no profile')
      const r = await fetch(`/api/profiles/${profile.userId}/follow`, { method: 'POST' })
      if (!r.ok) {
        if (r.status === 401) window.dispatchEvent(new Event('open-login'))
        throw new Error('follow failed')
      }
      const d = await r.json()
      // Plan SC FR-06: 팔로우 성공 시 creator_follow (source: 'profile')
      if (d.following) {
        track(EVENTS.CREATOR_FOLLOW, { source: 'profile', target_user_id: profile.userId })
      }
      return { state: d.following, count: d.followerCount }
    },
    onError: () => toast.error('팔로우에 실패했어요'),
  })

  // 본인/타인 구분 없이 getUserSongs로 통합 — 카운트 정확
  const songs = otherSongs

  if (loadingOther) {
    return <ProfilePanelSkeleton />
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        사용자를 찾을 수 없어요
      </div>
    )
  }

  const initials = (profile.displayName ?? profile.username).slice(0, 1).toUpperCase()
  const displayAvatarUrl = isSelf ? avatarUrl : (profile.avatarImage ?? null)
  const displayCoverUrl  = isSelf ? coverUrl  : (profile.coverImage  ?? null)

  function handlePlay(pub: PublicSong) {
    const feed = songs.map(toSong)
    const idx  = songs.findIndex((s) => s.id === pub.id)
    window.dispatchEvent(new CustomEvent('view-song', { detail: { feed, idx, isOwner: isSelf, ownerUserId: profile?.userId ?? null, ownerAvatarUrl: displayAvatarUrl, ownerAvatarHue: profile?.avatarHue ?? null, ownerName: profile?.displayName ?? profile?.username ?? null, origin: 'profile' } }))
  }

  function handleThumbPlay(pub: PublicSong) {
    const feed = songs.map(toSong)
    const idx  = songs.findIndex((s) => s.id === pub.id)
    window.dispatchEvent(new CustomEvent('play-song', { detail: { feed, idx, isOwner: isSelf, ownerUserId: profile?.userId ?? null, ownerAvatarUrl: displayAvatarUrl, ownerAvatarHue: profile?.avatarHue ?? null, ownerName: profile?.displayName ?? profile?.username ?? null, origin: 'profile' } }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1064px] mx-auto md:pt-4">

          {/* ── 커버 + 아바타 (통합) — 모바일 풀폭·radius 0·헤더 밀착, 데스크톱 1064:368 + rounded ── */}
          <div
            className={`relative w-full rounded-none md:rounded-3xl overflow-hidden aspect-video md:aspect-[1064/368] ${isSelf ? 'group/cover' : ''}`}
            style={{ background: profileColor(profile.avatarHue).bg }}
          >
            {displayCoverUrl && (
              <Image src={displayCoverUrl} alt="" fill className="object-cover" sizes="100vw" unoptimized />
            )}

            {/* 하단 그라데이션 */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

            {/* 커버 가장자리 라인 — 좌측 패널 라인색 */}
            <div className="pointer-events-none absolute inset-0 rounded-none md:rounded-3xl ring-1 ring-inset ring-white/[0.08]" />

            {/* 아바타 + 이름 — 커버 좌하단 */}
            <div className="absolute left-5 bottom-4 z-10 flex items-center gap-4">
              <div
                className={`relative w-[80px] h-[80px] md:w-[100px] md:h-[100px] shrink-0 ${isSelf ? 'group/avatar' : ''}`}
                onMouseEnter={isSelf ? () => setAvatarHovered(true) : undefined}
                onMouseLeave={isSelf ? () => setAvatarHovered(false) : undefined}
              >
                {displayAvatarUrl ? (
                  <div className="relative w-full h-full rounded-full overflow-hidden">
                    <Image src={displayAvatarUrl} alt={profile.displayName ?? ''} fill className="object-cover" sizes="100px" unoptimized />
                  </div>
                ) : (
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-3xl md:text-4xl font-bold"
                    style={{ background: profileColor(profile.avatarHue).bg, color: profileColor(profile.avatarHue).text }}
                  >
                    {initials}
                  </div>
                )}
                {uploading === 'avatar' && (
                  <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {isSelf && uploading !== 'avatar' && (
                  <div className="absolute inset-0 rounded-full overflow-hidden hidden md:block [&>div]:opacity-0 [&>div]:group-hover/avatar:opacity-100">
                    <ImageEditOverlay
                      hasImage={!!displayAvatarUrl}
                      onUpload={handleAvatarUpload}
                      onDelete={displayAvatarUrl ? handleAvatarDelete : undefined}
                    />
                  </div>
                )}
                {/* 아바타 가장자리 라인 — 좌측 패널 라인색 */}
                <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/[0.08]" />
              </div>

              {/* 이름 + 아이디 */}
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white leading-tight">{profile.displayName}</p>
                <p className="text-xs md:text-sm text-white/60 mt-1">@{profile.username}</p>
              </div>
            </div>

            {/* 프로필 수정 / 팔로우 — 모바일 우상단, 데스크톱 우하단 */}
            <div className="absolute top-3 right-3 md:top-auto md:bottom-4 md:right-5 z-10 flex items-center gap-2">
              {isSelf ? (
                <>
                  <button
                    onClick={() => {
                      imgSnapshotRef.current = { avatar: avatarUrl, cover: coverUrl }
                      pendingAvatarRef.current = null
                      pendingCoverRef.current = null
                      setEditOpen(true)
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 transition-colors"
                  >
                    <Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
                    프로필 수정
                  </button>
                  {/* 설정(로그아웃) 버튼 — 모바일 전용. 데스크톱은 헤더 아바타 드롭다운에 로그아웃 있음 */}
                  <div className="md:hidden">
                    <SelfSettingsMenu />
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => toggleFollow()}
                    aria-pressed={following}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm transition-colors bg-black/25 text-white hover:bg-black/40"
                  >
                    <Image
                      src={following ? '/Following.svg' : '/Follow.svg'}
                      alt=""
                      width={14}
                      height={14}
                      style={{ filter: 'invert(1)' }}
                    />
                    {following ? '팔로잉' : '팔로우'}
                  </button>
                  <ProfileBlockMenu userId={profile.userId} name={profile.displayName || profile.username} />
                </>
              )}
            </div>

            {uploading === 'cover' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            {isSelf && uploading !== 'cover' && !avatarHovered && (
              <div className="absolute inset-0 hidden md:block [&>div]:opacity-0 [&>div]:group-hover/cover:opacity-100">
                <ImageEditOverlay
                  hasImage={!!displayCoverUrl}
                  onUpload={handleCoverUpload}
                  onDelete={displayCoverUrl ? handleCoverDelete : undefined}
                />
              </div>
            )}
          </div>

          {/* ── 프로필 헤더 ── */}
          <div className="relative px-5 pb-5">
            <div className="mt-6 space-y-5">
              <div className="flex gap-6 text-sm text-zinc-500">
                <span><span className="text-white font-semibold">{profile.songCount}</span> 곡</span>
                <span><span className="text-white font-semibold">{followerCount.toLocaleString()}</span> 팔로워</span>
                <span><span className="text-white font-semibold">{profile.followingCount.toLocaleString()}</span> 팔로잉</span>
              </div>
              {profile.bio && <p className="text-sm text-zinc-300 whitespace-pre-line">{profile.bio}</p>}
              {profile.links && <SocialLinksRow links={profile.links} />}
            </div>
          </div>

          {/* ── 곡 그리드 ── */}
          <div className="pt-4 pb-8">
            {/* 탭 바 */}
            <div className="flex border-b border-white/10 mb-px">
              <button className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-white border-b-2 border-white">
                <Image src="/Music.svg" alt="" width={20} height={20} style={{ filter: 'invert(1)' }} />
                <span className="hidden md:inline">음악</span>
              </button>
              <button className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-sm text-zinc-600 cursor-default" disabled>
                <Image src="/Movie.svg" alt="" width={20} height={20} style={{ filter: 'invert(0.3)' }} />
                <span className="hidden md:inline">영상</span>
              </button>
            </div>
            {songs.length === 0 ? (
              <p className="px-5 py-8 text-zinc-600 text-sm">아직 공개된 곡이 없어요</p>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-1">
                {songs.map((song) => (
                  <ProfileSongThumb key={song.id} song={song} onPlay={handlePlay} onThumbPlay={handleThumbPlay} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isSelf && editOpen && user && dbProfile && (
        <ProfileEditModal
          userId={user.id}
          initial={{
            username: dbProfile.username,
            displayName: dbProfile.displayName ?? '',
            bio: dbProfile.bio ?? '',
            links: dbProfile.links,
            usernameChangedAt: dbProfile.usernameChangedAt,
            nameChangeLog: dbProfile.nameChangeLog,
          }}
          images={{
            avatarUrl,
            coverUrl,
            avatarHue: dbProfile.avatarHue,
            initials,
            uploading,
            onAvatarUpload: handleAvatarStage,
            onAvatarDelete: handleAvatarDelete,
            onCoverUpload: handleCoverStage,
            onCoverDelete: handleCoverDelete,
          }}
          onClose={() => {
            // 취소 — 스테이징 폐기 + 미리보기 스냅샷 복원
            setAvatarUrl(imgSnapshotRef.current.avatar)
            setCoverUrl(imgSnapshotRef.current.cover)
            pendingAvatarRef.current = null
            pendingCoverRef.current = null
            setEditOpen(false)
          }}
          onSaved={async (next) => {
            // 저장 시점에만 스테이징된 이미지 커밋 (storage 업로드 + DB)
            if (user && (pendingAvatarRef.current !== null || pendingCoverRef.current !== null)) {
              const patch: Record<string, unknown> = {}
              const pa = pendingAvatarRef.current
              if (pa instanceof Blob) {
                const url = await uploadProfileImage(user.id, pa, 'avatar')
                if (url) { setAvatarUrl(url); patch.avatar_url = url }
              } else if (pa === 'delete') {
                await deleteProfileImage(user.id, 'avatar')
                patch.avatar_url = null
              }
              const pc = pendingCoverRef.current
              if (pc instanceof Blob) {
                const url = await uploadProfileImage(user.id, pc, 'cover')
                if (url) { setCoverUrl(url); patch.cover_url = url }
              } else if (pc === 'delete') {
                await deleteProfileImage(user.id, 'cover')
                patch.cover_url = null
              }
              if (Object.keys(patch).length > 0) {
                await createClient().from('profiles').update(patch).eq('id', user.id)
                if ('avatar_url' in patch) {
                  window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: patch.avatar_url ?? null }))
                }
              }
              pendingAvatarRef.current = null
              pendingCoverRef.current = null
            }
            patchDbProfile({
              username: next.username,
              displayName: next.displayName,
              bio: next.bio,
              links: next.links,
              usernameChangedAt: next.usernameChangedAt,
              nameChangeLog: next.nameChangeLog,
            })
            setEditOpen(false)
            window.dispatchEvent(new CustomEvent('profile-updated', {
              detail: { username: next.username, displayName: next.displayName },
            }))
          }}
        />
      )}

      {/* 업로드 시 위치 조정 */}
      <CropModal
        open={!!cropState}
        imageFile={cropState?.file ?? null}
        aspect={cropState?.type === 'cover' ? 1064 / 368 : 1}
        title={cropState?.type === 'cover' ? '커버 위치 조정' : '프로필 사진 위치 조정'}
        outputMaxPx={cropState?.type === 'cover' ? 1200 : 400}
        onCancel={() => setCropState(null)}
        onConfirm={handleCropConfirm}
      />
    </div>
  )
}

// 본인 프로필 우상단 설정 아이콘 → 이메일·법적 메뉴·로그아웃 드롭다운
// 커버의 overflow-hidden 경계를 탈출하기 위해 React Portal로 body에 렌더링.
// 타인 프로필 더보기(⋮) — 차단. SelfSettingsMenu와 동일하게 portal+fixed로 커버 overflow 회피.
function ProfileBlockMenu({ userId, name }: { userId: string; name: string }) {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  function toggle() {
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    if (open) { setOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  async function block() {
    setConfirmBlock(false)
    const res = await fetch(`/api/users/${userId}/block`, { method: 'POST' })
    if (res.ok) { toast.success('차단했어요'); router.push('/') } else toast.error('처리에 실패했어요')
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 flex items-center justify-center transition-colors"
        title="더보기"
      >
        <Image src="/More.svg" alt="더보기" width={18} height={18} style={{ filter: 'invert(1)' }} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[54]" onClick={() => setOpen(false)} />
          <div className="fixed z-[55] w-28 bg-[#282D38] border border-white/[0.08] rounded-xl py-1 shadow-xl overflow-hidden" style={{ top: pos.top, right: pos.right }}>
            <button
              onClick={() => { setOpen(false); setConfirmBlock(true) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
              차단
            </button>
          </div>
        </>,
        document.body,
      )}
      <ConfirmModal
        open={confirmBlock}
        title={`${name}님을 차단할까요?`}
        description="이 사용자의 곡·댓글·게시글이 더 이상 보이지 않아요."
        confirmLabel="차단하기"
        cancelLabel="아니요"
        variant="danger"
        onClose={() => setConfirmBlock(false)}
        onConfirm={block}
      />
    </div>
  )
}

function SelfSettingsMenu() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const { user, signOut } = useAuth()

  // 보유 크레딧 — 데스크톱 헤더 드롭다운과 동일 소스(1회 조회 + credits-updated 동기화)
  useEffect(() => {
    if (!user) { setCredits(null); return }
    let cancelled = false
    const toTotal = (s: { total?: number; remaining?: number; bonus?: number }) => s.total ?? ((s.remaining ?? 0) + (s.bonus ?? 0))
    fetch('/api/credits/me').then((r) => r.ok ? r.json() : null).then((d) => { if (!cancelled && d) setCredits(toTotal(d)) })
    function onUpd(e: Event) { const s = (e as CustomEvent).detail; if (s) setCredits(toTotal(s)) }
    window.addEventListener('credits-updated', onUpd)
    return () => { cancelled = true; window.removeEventListener('credits-updated', onUpd) }
  }, [user?.id])

  function toggle() {
    if (open) { setOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    setOpen(true)
  }

  // 스크롤·리사이즈 시 닫기 (메뉴 위치가 더 이상 버튼과 정렬되지 않음)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 flex items-center justify-center transition-colors"
        title="설정"
      >
        <Image src="/More.svg" alt="설정" width={18} height={18} style={{ filter: 'invert(1)' }} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[54]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[55] w-60 bg-[#21252E] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <p className="text-[11px] text-zinc-500">로그인 계정</p>
              <p className="text-xs text-white truncate mt-1">{user?.email}</p>
            </div>
            {/* 크레딧 표시(짙은 회색 프레임) + 충전 + 플랜 업그레이드 */}
            <div className="px-3 pt-3 pb-3 space-y-2 border-b border-white/[0.06]">
              <div className="flex items-center justify-between px-3 py-3 rounded-lg bg-[#2C313D]">
                <span className="flex items-center gap-1.5 text-sm text-white">
                  <Image src="/Sparkles.svg" alt="" width={15} height={15} style={{ filter: 'invert(1)' }} />
                  크레딧
                </span>
                <span className="text-sm font-semibold text-white tabular-nums">{credits ?? '—'}</span>
              </div>
              <button
                onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-credit-purchase')) }}
                className="w-full py-3 rounded-lg bg-white hover:bg-zinc-100 text-zinc-900 text-sm font-semibold transition active:scale-[0.98]"
              >
                크레딧 충전하기
              </button>
              <button
                onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'sidebar' })) }}
                className="w-full py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition active:scale-[0.98]"
              >
                플랜 업그레이드
              </button>
              <p className="text-center text-[11px] text-zinc-500">업그레이드 시 추가 크레딧 제공</p>
            </div>
            {/* 계정 — 결제내역·환불·탈퇴 등. (법적·문의는 둘러보기 푸터로 이동) */}
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors border-b border-white/[0.06]"
            >
              내 계정
            </Link>
            <button
              onClick={() => {
                setOpen(false)
                window.dispatchEvent(new Event('song-updated'))
                window.dispatchEvent(new Event('collection-updated'))
                signOut()
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              로그아웃
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

function ProfilePanelSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1064px] mx-auto md:pt-4">

          {/* 커버 + 아바타+이름 (좌하단 absolute) + 편집/팔로우 버튼 — 실제 디자인과 동일 */}
          <div className="relative w-full rounded-none md:rounded-3xl overflow-hidden aspect-video md:aspect-[1064/368] bg-white/[0.04] shimmer">
            {/* 하단 그라데이션 (실제에 있는 스크림) */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

            {/* 아바타 + 이름 좌하단 */}
            <div className="absolute left-5 bottom-4 z-10 flex items-center gap-4">
              <div className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-full bg-white/[0.10] shimmer shrink-0" />
              <div className="space-y-2">
                <div className="h-6 md:h-7 w-40 rounded bg-white/[0.10] shimmer" />
                <div className="h-3 w-24 rounded bg-white/[0.10] shimmer" />
              </div>
            </div>

            {/* 편집/팔로우 버튼 — 모바일 우상단 / 데스크톱 우하단 */}
            <div className="absolute top-3 right-3 md:top-auto md:bottom-4 md:right-5 z-10">
              <div className="h-9 w-28 rounded-full bg-white/[0.10] shimmer" />
            </div>
          </div>

          {/* 프로필 헤더 — 스탯·bio 영역 */}
          <div className="relative px-5 pb-5">
            <div className="mt-6 space-y-5">
              <div className="flex gap-6">
                <div className="h-4 w-12 rounded bg-white/[0.04] shimmer" />
                <div className="h-4 w-16 rounded bg-white/[0.04] shimmer" />
                <div className="h-4 w-16 rounded bg-white/[0.04] shimmer" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-white/[0.04] shimmer" />
                <div className="h-3 w-2/5 rounded bg-white/[0.04] shimmer" />
              </div>
            </div>
          </div>

          {/* 탭 바 (음악 / 뮤직비디오) */}
          <div className="pt-4">
            <div className="flex border-b border-white/10 mb-px">
              <div className="flex-1 py-2.5 flex items-center justify-center border-b-2 border-white">
                <div className="h-4 w-12 rounded bg-white/[0.06] shimmer" />
              </div>
              <div className="flex-1 py-2.5 flex items-center justify-center">
                <div className="h-4 w-20 rounded bg-white/[0.04] shimmer" />
              </div>
            </div>

            {/* 곡 그리드 — 3 cols 모바일 / 5 cols 데스크톱, gap-1, 2:3 aspect (Instagram 패턴) */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-1">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-white/[0.04] shimmer" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
