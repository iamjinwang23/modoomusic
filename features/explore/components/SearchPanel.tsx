'use client'

// Design Ref: search §5.2 — 4탭 검색 결과 패널
// 전체 탭: 곡 6 + 사용자 5 + 태그 3 미리보기 / 각 카테고리 탭: 풀 리스트
// 결과 클릭 시 view-song(origin='search') / view-profile / onTagClick 호출

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle'
import { profileColor } from '@/utils/profileColor'
import { track, EVENTS } from '@/utils/analytics'
import { PublicSongCard } from './PublicSongCard'
import type { PublicSong, Song } from '@/types/domain'
import type { SearchUser, SearchTag, SearchResults } from '@/services/search.service'

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

function dispatchView(pub: PublicSong, feed: PublicSong[], currentUserId: string | null) {
  const songs = feed.map(toSong)
  const idx = feed.findIndex((s) => s.id === pub.id)
  const isOwner = !!currentUserId && pub.userId === currentUserId
  window.dispatchEvent(new CustomEvent('view-song', {
    detail: { feed: songs, idx, isOwner, ownerUserId: pub.userId, ownerName: pub.displayName, ownerAvatarUrl: pub.avatarUrl ?? null, ownerAvatarHue: pub.avatarHue ?? null, origin: 'search' },
  }))
}

function dispatchPlayOnly(pub: PublicSong, feed: PublicSong[], currentUserId: string | null) {
  const songs = feed.map(toSong)
  const idx = feed.findIndex((s) => s.id === pub.id)
  const isOwner = !!currentUserId && pub.userId === currentUserId
  window.dispatchEvent(new CustomEvent('play-song', {
    detail: { feed: songs, idx, isOwner, ownerUserId: pub.userId, ownerName: pub.displayName, ownerAvatarUrl: pub.avatarUrl ?? null, ownerAvatarHue: pub.avatarHue ?? null, origin: 'search' },
  }))
}

// 사용자 카드 — RecommendedCreators 패턴 차용
function UserCard({ user }: { user: SearchUser }) {
  const { user: me } = useAuth()
  const { state: following, count: followerCount, toggle } = useOptimisticToggle({
    initialState: !!user.isFollowing,
    initialCount: user.followerCount,
    guard: () => {
      if (!me) { window.dispatchEvent(new Event('open-login')); return false }
      return true
    },
    fetcher: async () => {
      const r = await fetch(`/api/profiles/${user.id}/follow`, { method: 'POST' })
      if (!r.ok) {
        if (r.status === 401) window.dispatchEvent(new Event('open-login'))
        throw new Error('follow failed')
      }
      const d = await r.json()
      if (d.following) {
        track(EVENTS.CREATOR_FOLLOW, { source: 'search', target_user_id: user.id })
      }
      return { state: d.following, count: d.followerCount }
    },
  })

  const initial = (user.displayName || user.username).slice(0, 1).toUpperCase()
  const color = profileColor(user.avatarHue)

  function openProfile() {
    track(EVENTS.SEARCH_RESULT_CLICK, { type: 'user' })
    window.dispatchEvent(new CustomEvent('view-profile', { detail: user.username }))
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
      <button type="button" onClick={openProfile} className="shrink-0">
        <div
          className="relative w-12 h-12 rounded-full overflow-hidden flex items-center justify-center"
          style={{ background: color.bg }}
        >
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.displayName} fill className="object-cover" sizes="48px" unoptimized />
          ) : (
            <span className="text-lg font-semibold text-white">{initial}</span>
          )}
        </div>
      </button>

      <button type="button" onClick={openProfile} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-white truncate">{user.displayName}</p>
        <p className="text-xs text-zinc-400 truncate">@{user.username} · 팔로워 {followerCount}</p>
      </button>

      <button
        onClick={(e) => { e.preventDefault(); toggle() }}
        aria-pressed={following}
        className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
          following
            ? 'bg-white/[0.12] text-zinc-300 hover:bg-white/[0.18]'
            : 'bg-violet-600 text-white hover:bg-violet-500'
        }`}
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
    </div>
  )
}

// 태그 칩
function TagChip({ tag, onClick }: { tag: SearchTag; onClick: (t: SearchTag) => void }) {
  function handleClick() {
    track(EVENTS.SEARCH_RESULT_CLICK, { type: 'tag' })
    onClick(tag)
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-sm text-zinc-100 transition-colors"
    >
      <span>{tag.label}</span>
      <span className="text-xs text-zinc-400">{tag.count}곡</span>
    </button>
  )
}

// 곡 그리드
function SongsGrid({ songs, currentUserId }: { songs: PublicSong[]; currentUserId: string | null }) {
  function handlePlay(pub: PublicSong) {
    track(EVENTS.SEARCH_RESULT_CLICK, { type: 'song' })
    dispatchView(pub, songs, currentUserId)
  }
  function handleThumbPlay(pub: PublicSong) {
    track(EVENTS.SEARCH_RESULT_CLICK, { type: 'song' })
    dispatchPlayOnly(pub, songs, currentUserId)
  }
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] md:[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
      {songs.map((s) => (
        <PublicSongCard key={s.id} song={s} onPlay={handlePlay} onThumbPlay={handleThumbPlay} />
      ))}
    </div>
  )
}

type TabKey = 'all' | 'songs' | 'users' | 'tags'

export function SearchPanel({
  query,
  onTagClick,
  onSwitchTab,
}: {
  query: string
  onTagClick: (tag: SearchTag) => void
  onSwitchTab?: (next: TabKey) => void
}) {
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!query) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        const data: SearchResults = d.data ?? { songs: [], users: [], tags: [] }
        setResults(data)
        setLoading(false)
        // Plan SC FR-13: search_perform
        const total = data.songs.length + data.users.length + data.tags.length
        track(EVENTS.SEARCH_PERFORM, { query_length: query.length, result_count: total })
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        console.error('[search] fetch failed', e)
        setResults({ songs: [], users: [], tags: [] })
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [query])

  function switchTab(next: TabKey) {
    setActiveTab(next)
    onSwitchTab?.(next)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Tabs active={activeTab} onChange={switchTab} />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.04] shimmer" />
          ))}
        </div>
      </div>
    )
  }

  if (!results) return null

  const empty = results.songs.length === 0 && results.users.length === 0 && results.tags.length === 0

  return (
    <div className="space-y-6">
      <Tabs active={activeTab} onChange={switchTab} />

      {empty ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-base text-zinc-300 mb-2">검색 결과가 없어요</p>
          <p className="text-xs">철자를 확인하거나 다른 키워드로 시도해보세요</p>
        </div>
      ) : activeTab === 'all' ? (
        <div className="space-y-8">
          {results.songs.length > 0 && (
            <Section title="곡" onMore={results.songs.length > 6 ? () => switchTab('songs') : undefined}>
              <SongsGrid songs={results.songs.slice(0, 6)} currentUserId={currentUserId} />
            </Section>
          )}
          {results.users.length > 0 && (
            <Section title="사용자" onMore={results.users.length > 5 ? () => switchTab('users') : undefined}>
              <div className="space-y-2">
                {results.users.slice(0, 5).map((u) => <UserCard key={u.id} user={u} />)}
              </div>
            </Section>
          )}
          {results.tags.length > 0 && (
            <Section title="태그" onMore={results.tags.length > 3 ? () => switchTab('tags') : undefined}>
              <div className="flex flex-wrap gap-2">
                {results.tags.slice(0, 3).map((t) => <TagChip key={`${t.type}-${t.label}`} tag={t} onClick={onTagClick} />)}
              </div>
            </Section>
          )}
        </div>
      ) : activeTab === 'songs' ? (
        results.songs.length === 0 ? <EmptyTab label="곡" /> : <SongsGrid songs={results.songs} currentUserId={currentUserId} />
      ) : activeTab === 'users' ? (
        results.users.length === 0 ? <EmptyTab label="사용자" /> : (
          <div className="space-y-2">
            {results.users.map((u) => <UserCard key={u.id} user={u} />)}
          </div>
        )
      ) : (
        results.tags.length === 0 ? <EmptyTab label="태그" /> : (
          <div className="flex flex-wrap gap-2">
            {results.tags.map((t) => <TagChip key={`${t.type}-${t.label}`} tag={t} onClick={onTagClick} />)}
          </div>
        )
      )}
    </div>
  )
}

function Tabs({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'songs', label: '곡' },
    { key: 'users', label: '사용자' },
    { key: 'tags', label: '태그' },
  ]
  return (
    <div className="flex items-center gap-1 border-b border-white/[0.08]">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-3 text-base font-semibold transition-colors border-b-2 -mb-px ${
            active === t.key
              ? 'text-white border-violet-500'
              : 'text-zinc-400 border-transparent hover:text-zinc-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Section({ title, onMore, children }: { title: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-base font-semibold text-white">{title}</p>
        {onMore && (
          <button onClick={onMore} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
            더보기
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-zinc-500 text-sm">
      해당 {label}의 검색 결과가 없어요
    </div>
  )
}
