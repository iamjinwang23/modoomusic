'use client'

import { useState } from 'react'
import Image from 'next/image'
import { exploreService } from '@/services/explore.service'
import { useAuth } from '@/components/AuthProvider'
import { PublicSongCard } from './PublicSongCard'
import type { PublicSong, Song, UserProfile } from '@/types/domain'

function avatarGradient(hue: number) {
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
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
    duration: null,
    liked: pub.isLiked,
    coverHue: pub.coverHue,
  }
}

interface Props {
  username: string
}

export function ProfilePanel({ username }: Props) {
  const { user } = useAuth()
  const mockProfile = exploreService.getProfile(username)

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
      songCount: 0,
    }
  })() : null

  const profile = mockProfile ?? selfProfile
  const songs = exploreService.getUserSongs(username)

  const [following, setFollowing] = useState(profile?.isFollowing ?? false)
  const isSelf = !!user && (mockProfile === null && selfProfile !== null)

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        사용자를 찾을 수 없어요
      </div>
    )
  }

  const initials = profile.username.slice(0, 2).toUpperCase()

  function handlePlay(pub: PublicSong) {
    const feed = songs.map(toSong)
    const idx = songs.findIndex((s) => s.id === pub.id)
    window.dispatchEvent(new CustomEvent('view-song', {
      detail: { feed, idx, isOwner: false },
    }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1064px] mx-auto pt-4">
          {/* 커버 — 1064×368 */}
          <div
            className="relative w-full rounded-2xl overflow-hidden"
            style={{ background: avatarGradient(profile.avatarHue), aspectRatio: '1064 / 368' }}
          >
            {profile.coverImage && (
              <Image src={profile.coverImage} alt="" fill className="object-cover" sizes="100vw" />
            )}
          </div>

          {/* 프로필 헤더 */}
          <div className="relative px-5 pb-5">
            {profile.avatarImage ? (
              <div className="relative w-24 h-24 rounded-full overflow-hidden -mt-12 border-4 border-[#111111] shrink-0">
                <Image src={profile.avatarImage} alt={profile.displayName} fill className="object-cover" sizes="96px" />
              </div>
            ) : (
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold text-white -mt-12 border-4 border-[#111111]"
                style={{ background: avatarGradient(profile.avatarHue) }}
              >
                {initials}
              </div>
            )}

            <div className="mt-3 flex items-start justify-between">
              <div>
                <p className="text-base font-semibold">{profile.displayName}</p>
                <p className="text-xs text-zinc-500 mt-0.5">@{profile.username}</p>
                {profile.bio && (
                  <p className="text-xs text-zinc-400 mt-1">{profile.bio}</p>
                )}
                <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                  <span><span className="text-zinc-200 font-medium">{profile.followerCount.toLocaleString()}</span> 팔로워</span>
                  <span><span className="text-zinc-200 font-medium">{profile.followingCount.toLocaleString()}</span> 팔로잉</span>
                  <span><span className="text-zinc-200 font-medium">{profile.songCount}</span> 곡</span>
                </div>
              </div>

              {!isSelf && (
                <button
                  onClick={() => setFollowing((v) => !v)}
                  className={`mt-1 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
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

          {/* 곡 목록 */}
          <div className="pb-8">
            <div className="px-5 mb-3">
              <p className="text-sm font-semibold text-zinc-200">곡 목록</p>
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
