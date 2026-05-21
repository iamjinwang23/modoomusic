'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { exploreService } from '@/services/explore.service'
import { songService } from '@/services/song.service'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import { PublicSongCard } from './PublicSongCard'
import type { PublicSong, Song, UserProfile } from '@/types/domain'


const PALETTE = [
  { bg: 'hsl(87,57%,73%)',  text: 'hsl(87,45%,32%)'  },
  { bg: 'hsl(261,76%,75%)', text: 'hsl(261,55%,35%)' },
  { bg: 'hsl(40,60%,82%)',  text: 'hsl(40,50%,35%)'  },
  { bg: 'hsl(129,33%,77%)', text: 'hsl(129,30%,30%)' },
  { bg: 'hsl(0,49%,80%)',   text: 'hsl(0,40%,35%)'   },
  { bg: 'hsl(22,73%,75%)',  text: 'hsl(22,55%,35%)'  },
]
function profileColor(hue: number) { return PALETTE[hue % PALETTE.length] }

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
  return supabase.storage.from('profile-images').getPublicUrl(path).data.publicUrl
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
  const { user } = useAuth()
  const mockProfile = exploreService.getProfile(username)

  const publishedCount = !mockProfile && user
    ? songService.getAll().filter((s) => s.published).length
    : 0

  const selfProfile: UserProfile | null = !mockProfile && user ? (() => {
    const derivedUsername = user.user_metadata?.username ?? user.email?.split('@')[0] ?? user.id.slice(0, 8)
    if (derivedUsername !== username && user.id.slice(0, 8) !== username) return null
    return {
      username,
      displayName: user.user_metadata?.full_name ?? username,
      userId: user.id,
      bio: null,
      avatarHue: (user.id.charCodeAt(0) * 137) % 360,
      followerCount: 0,
      followingCount: 0,
      songCount: publishedCount,
    }
  })() : null

  const isSelf = !!user && mockProfile === null && selfProfile !== null

  // DB에서 실제 이미지 URL 로드
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null)
  const [avatarHovered, setAvatarHovered] = useState(false)

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
    }
    setUploading(null)
  }

  async function handleAvatarDelete() {
    if (!user || !avatarUrl) return
    await deleteProfileImage(user.id, 'avatar')
    setAvatarUrl(null)
    await createClient().from('profiles').update({ avatar_url: null }).eq('id', user.id)
    window.dispatchEvent(new CustomEvent('profile-avatar-updated', { detail: null }))
  }

  async function handleCoverUpload(file: File) {
    if (!user) return
    setUploading('cover')
    const url = await uploadProfileImage(user.id, file, 'cover')
    if (url) {
      setCoverUrl(url)
      await createClient().from('profiles').update({ cover_url: url }).eq('id', user.id)
    }
    setUploading(null)
  }

  async function handleCoverDelete() {
    if (!user || !coverUrl) return
    await deleteProfileImage(user.id, 'cover')
    setCoverUrl(null)
    await createClient().from('profiles').update({ cover_url: null }).eq('id', user.id)
  }

  const profile = mockProfile ?? selfProfile
  const [following, setFollowing] = useState(profile?.isFollowing ?? false)

  const mockSongs = exploreService.getUserSongs(username)
  const selfSongs: PublicSong[] = isSelf
    ? songService.getAll().filter((s) => s.published).map((s) => ({
        id: s.id, createdAt: s.createdAt, title: s.title, prompt: s.prompt,
        genre: s.genre, mood: s.mood, lyrics: s.lyrics, instrumental: s.instrumental,
        audioUrl: s.audioUrl, duration: s.duration, coverHue: s.coverHue ?? 0,
        coverImage: s.coverImage, username, displayName: profile?.displayName ?? username,
        userId: user!.id, likeCount: 0, playCount: 0, isLiked: false,
      }))
    : []
  const songs = isSelf ? selfSongs : mockSongs

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
    window.dispatchEvent(new CustomEvent('view-song', { detail: { feed, idx, isOwner: isSelf, ownerAvatarUrl: displayAvatarUrl, ownerName: profile?.displayName ?? profile?.username ?? null } }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1064px] mx-auto pt-4">

          {/* ── 커버 + 아바타 (통합) ── */}
          <div
            className={`relative w-full rounded-2xl overflow-hidden ${isSelf ? 'group/cover' : ''}`}
            style={{ background: profileColor(profile.avatarHue).bg, aspectRatio: '1064 / 368' }}
          >
            {displayCoverUrl && (
              <Image src={displayCoverUrl} alt="" fill className="object-cover" sizes="100vw" unoptimized />
            )}

            {/* 하단 그라데이션 */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

            {/* 아바타 + 이름 — 커버 좌하단 */}
            <div className="absolute left-5 bottom-4 z-10 flex items-center gap-4">
              <div
                className={`relative w-[100px] h-[100px] shrink-0 ${isSelf ? 'group/avatar' : ''}`}
                onMouseEnter={isSelf ? () => setAvatarHovered(true) : undefined}
                onMouseLeave={isSelf ? () => setAvatarHovered(false) : undefined}
              >
                {displayAvatarUrl ? (
                  <div className="relative w-full h-full rounded-full overflow-hidden">
                    <Image src={displayAvatarUrl} alt={profile.displayName ?? ''} fill className="object-cover" sizes="100px" unoptimized />
                  </div>
                ) : (
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-4xl font-bold"
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
                  <div className="absolute inset-0 rounded-full overflow-hidden [&>div]:opacity-0 [&>div]:group-hover/avatar:opacity-100">
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
                <p className="text-3xl font-bold text-white leading-tight">{profile.displayName}</p>
                <p className="text-sm text-white/60 mt-1">@{profile.username}</p>
              </div>
            </div>

            {uploading === 'cover' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            {isSelf && uploading !== 'cover' && !avatarHovered && (
              <div className="absolute inset-0 [&>div]:opacity-0 [&>div]:group-hover/cover:opacity-100">
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
            <div className="mt-6 flex items-start justify-between">
              <div>
                {profile.bio && <p className="text-xs text-zinc-400 mb-2">{profile.bio}</p>}
                <div className="flex gap-4 text-xs text-zinc-500">
                  <span><span className="text-white font-medium">{profile.followerCount.toLocaleString()}</span> 팔로워</span>
                  <span><span className="text-white font-medium">{profile.followingCount.toLocaleString()}</span> 팔로잉</span>
                  <span><span className="text-white font-medium">{profile.songCount}</span> 곡</span>
                </div>
              </div>
              {!isSelf && (
                <button
                  onClick={() => setFollowing((v) => !v)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    following
                      ? 'bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]'
                      : 'bg-violet-600 hover:bg-violet-500 text-white'
                  }`}
                >
                  {following ? '팔로잉' : '팔로우'}
                </button>
              )}
            </div>
          </div>

          {/* ── 곡 목록 ── */}
          <div className="pb-8">
            <div className="px-5 mb-3">
              <h2 className="text-xl font-semibold text-white">곡 목록</h2>
            </div>
            {songs.length === 0 ? (
              <p className="px-5 text-zinc-600 text-sm">아직 공개된 곡이 없어요</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto px-5 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {songs.map((song) => (
                  <div key={song.id} className="shrink-0 w-[200px]">
                    <PublicSongCard song={song} onPlay={handlePlay} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
