'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { exploreService } from '@/services/explore.service'
import { songService } from '@/services/song.service'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import { ProfileEditModal } from '@/components/ProfileEditModal'
import { SocialLinksRow } from '@/components/SocialLinksRow'
import { toast } from '@/components/toast/toast'
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { SoundWaveIcon } from '@/components/SoundWaveIcon'
import type { PublicSong, Song, UserProfile, SocialLinks } from '@/types/domain'
import { profileColor } from '@/utils/profileColor'

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
        {song.coverImage && (
          <Image src={song.coverImage} alt={song.title || ''} fill className="object-cover" sizes="(min-width: 768px) 16vw, 33vw" />
        )}
      </div>
      {isThisPlaying && (
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
  }
}

// ── 이미지 → WebP 변환 ───────────────────────────────────────────
function toWebp(file: File, maxPx: number, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/webp', quality)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// ── 이미지 업로드 유틸 ────────────────────────────────────────────
const MAX_PX = { avatar: 400, cover: 1200 }

async function uploadProfileImage(userId: string, file: File, type: 'avatar' | 'cover'): Promise<string | null> {
  const supabase = createClient()
  const blob = await toWebp(file, MAX_PX[type])
  const path = `${userId}/${type}.webp`
  const { error } = await supabase.storage
    .from('profile-images')
    .upload(path, blob, { upsert: true, contentType: 'image/webp' })
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
  const pendingAvatarRef = useRef<File | 'delete' | null>(null)
  const pendingCoverRef = useRef<File | 'delete' | null>(null)

  useEffect(() => {
    if (!isSelf || !user) return
    const supabase = createClient()
    supabase.from('profiles').select('avatar_url, cover_url').eq('id', user.id).single()
      .then(({ data }) => {
        if (data) { setAvatarUrl(data.avatar_url); setCoverUrl(data.cover_url) }
      })
  }, [isSelf, user?.id])

  async function handleAvatarUpload(file: File) {
    if (!user) return
    setUploading('avatar')
    const url = await uploadProfileImage(user.id, file, 'avatar')
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
    pendingAvatarRef.current = file
    setAvatarUrl(URL.createObjectURL(file))  // objectURL 미리보기 (업로드는 저장 시)
  }
  function handleAvatarDelete() {
    pendingAvatarRef.current = 'delete'
    setAvatarUrl(null)
  }

  async function handleCoverUpload(file: File) {
    if (!user) return
    setUploading('cover')
    const url = await uploadProfileImage(user.id, file, 'cover')
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
    pendingCoverRef.current = file
    setCoverUrl(URL.createObjectURL(file))
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
    window.dispatchEvent(new CustomEvent('view-song', { detail: { feed, idx, isOwner: isSelf, ownerUserId: profile?.userId ?? null, ownerAvatarUrl: displayAvatarUrl, ownerAvatarHue: profile?.avatarHue ?? null, ownerName: profile?.displayName ?? profile?.username ?? null } }))
  }

  function handleThumbPlay(pub: PublicSong) {
    const feed = songs.map(toSong)
    const idx  = songs.findIndex((s) => s.id === pub.id)
    window.dispatchEvent(new CustomEvent('play-song', { detail: { feed, idx, isOwner: isSelf, ownerUserId: profile?.userId ?? null, ownerAvatarUrl: displayAvatarUrl, ownerAvatarHue: profile?.avatarHue ?? null, ownerName: profile?.displayName ?? profile?.username ?? null } }))
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
                <span className="hidden md:inline">뮤직비디오</span>
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
              if (pa instanceof File) {
                const url = await uploadProfileImage(user.id, pa, 'avatar')
                if (url) { setAvatarUrl(url); patch.avatar_url = url }
              } else if (pa === 'delete') {
                await deleteProfileImage(user.id, 'avatar')
                patch.avatar_url = null
              }
              const pc = pendingCoverRef.current
              if (pc instanceof File) {
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
    </div>
  )
}

// 본인 프로필 우상단 설정 아이콘 → 이메일·로그아웃 드롭다운
function SelfSettingsMenu() {
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 flex items-center justify-center transition-colors"
        title="설정"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[54]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-[55] w-52 bg-[#21252E] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <p className="text-[11px] text-zinc-500">로그인 계정</p>
              <p className="text-xs text-white truncate mt-1">{user?.email}</p>
            </div>
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
        </>
      )}
    </div>
  )
}

function ProfilePanelSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* 커버 배너 — 1064/368 비율 */}
      <div className="w-full max-w-[1064px] mx-auto" style={{ aspectRatio: '1064/368' }}>
        <div className="w-full h-full bg-white/[0.04] shimmer md:rounded-b-xl" />
      </div>
      {/* 본문 영역 */}
      <div className="max-w-[1064px] mx-auto px-5 pb-10">
        {/* 아바타 + 이름 행 */}
        <div className="flex items-end gap-4 -mt-12 mb-5">
          <div className="w-24 h-24 rounded-full bg-white/[0.04] shimmer border-4 border-[#171A20] shrink-0" />
          <div className="flex-1 min-w-0 space-y-2 pb-2">
            <div className="h-5 w-40 rounded bg-white/[0.04] shimmer" />
            <div className="h-3 w-28 rounded bg-white/[0.04] shimmer" />
          </div>
          <div className="h-9 w-24 rounded-full bg-white/[0.04] shimmer shrink-0" />
        </div>
        {/* 스탯/링크 행 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-3 w-16 rounded bg-white/[0.04] shimmer" />
          <div className="h-3 w-16 rounded bg-white/[0.04] shimmer" />
          <div className="h-3 w-16 rounded bg-white/[0.04] shimmer" />
        </div>
        {/* 곡 grid */}
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] md:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] w-full rounded-xl bg-white/[0.04] shimmer" />
              <div className="pt-2 space-y-1.5">
                <div className="h-4 w-3/4 rounded bg-white/[0.04] shimmer" />
                <div className="h-3 w-1/2 rounded bg-white/[0.04] shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
