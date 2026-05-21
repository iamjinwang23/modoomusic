'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { exploreService } from '@/services/explore.service'
import { PublicSongCard } from '@/features/explore/components/PublicSongCard'
import { SongDetailSheet } from '@/components/SongDetailSheet'
import type { PublicSong, Song } from '@/types/domain'

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

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const profile = exploreService.getProfile(username)
  const songs = exploreService.getUserSongs(username)

  const [following, setFollowing] = useState(profile?.isFollowing ?? false)
  const [selected, setSelected] = useState<PublicSong | null>(null)

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#171A20] text-zinc-500 text-sm">
        사용자를 찾을 수 없어요
      </div>
    )
  }

  const initials = profile.username.slice(0, 2).toUpperCase()
  const selectedIdx = selected ? songs.findIndex((s) => s.id === selected.id) : -1

  return (
    <div className="min-h-screen bg-[#171A20] text-white">
      {/* Cover */}
      <div
        className="h-32 w-full"
        style={{ background: avatarGradient(profile.avatarHue) }}
      />

      {/* Profile header */}
      <div className="px-5 pb-6">
        {/* Avatar */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white -mt-10 border-4 border-[#171A20]"
          style={{ background: avatarGradient(profile.avatarHue) }}
        >
          {initials}
        </div>

        <div className="mt-3 flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">@{profile.username}</p>
            {profile.bio && (
              <p className="text-sm text-zinc-400 mt-0.5">{profile.bio}</p>
            )}
            <div className="flex gap-4 mt-2 text-xs text-zinc-500">
              <span><span className="text-white font-medium">{profile.followerCount.toLocaleString()}</span> 팔로워</span>
              <span><span className="text-white font-medium">{profile.followingCount.toLocaleString()}</span> 팔로잉</span>
              <span><span className="text-white font-medium">{profile.songCount}</span> 곡</span>
            </div>
          </div>

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
        </div>
      </div>

      {/* Song grid */}
      <div className="px-5 pb-10">
        <p className="text-xs text-zinc-500 mb-3">곡 목록</p>
        {songs.length === 0 ? (
          <p className="text-zinc-600 text-sm">아직 공개된 곡이 없어요</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {songs.map((song) => (
              <PublicSongCard key={song.id} song={song} onPlay={setSelected} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <SongDetailSheet
          song={toSong(selected)}
          onClose={() => setSelected(null)}
          onPrev={selectedIdx > 0 ? () => setSelected(songs[selectedIdx - 1]) : undefined}
          onNext={selectedIdx < songs.length - 1 ? () => setSelected(songs[selectedIdx + 1]) : undefined}
        />
      )}
    </div>
  )
}
