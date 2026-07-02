'use client'
// 첨부 곡 임베드 카드 — 스포티파이 임베드 톤. 커버(블러 배경) + 제목·작성자 + 미니 플레이바 + 우상단 MONO 로고.
// 재생/상세는 글로벌 플레이어(useGlobalPlayer)로 연동 → 미니바 노출·상태 동기화.
import { useRef } from 'react'
import Image from 'next/image'
import { useGlobalPlayer } from '@/contexts/GlobalPlayerContext'
import { exploreService } from '@/services/explore.service'

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface Props {
  song: { id: string; title: string | null; coverImage: string | null; coverHue: number | null; audioUrl: string | null }
  artist: string | null
  ownerUserId: string | null
  ownerAvatarUrl?: string | null
  ownerAvatarHue?: number | null
  currentUserId: string | null
}

export function SongEmbedCard({ song, artist, ownerUserId, ownerAvatarUrl, ownerAvatarHue, currentUserId }: Props) {
  const player = useGlobalPlayer()
  const isCurrent = player.song?.id === song.id
  const playing = isCurrent && player.isPlaying
  const cur = isCurrent ? player.currentTime : 0
  const dur = isCurrent ? player.duration : 0
  const pct = dur > 0 ? (cur / dur) * 100 : 0

  const hue = song.coverHue ?? 0
  const bg = `linear-gradient(135deg, hsl(${hue},42%,22%) 0%, #15171e 88%)` // 커버 없을 때 폴백

  // 상세/미니바 payload — 공개 곡이면 전체 데이터(가사·좋아요 등) fetch, 아니면 최소 데이터 폴백. 1회 캐시.
  const detailRef = useRef<Record<string, unknown> | null>(null)
  async function buildDetail() {
    if (detailRef.current) return detailRef.current
    const pub = await exploreService.getShareSongById(song.id).catch(() => null)
    const payload = pub
      ? {
          feed: [{
            id: pub.id, createdAt: pub.createdAt, title: pub.title, prompt: pub.prompt, genre: pub.genre, mood: pub.mood,
            customLyrics: null, lyrics: pub.lyrics, instrumental: pub.instrumental, audioUrl: pub.audioUrl, duration: pub.duration ?? null,
            liked: pub.isLiked, coverHue: pub.coverHue, coverImage: pub.coverImage, model: pub.model,
            videoCoverUrl: pub.videoCoverUrl, videoCoverStatus: pub.videoCoverStatus,
            likeCount: pub.likeCount, playCount: pub.playCount, commentCount: pub.commentCount,
            published: pub.published, publishComment: pub.publishComment, publishCoverImage: pub.publishCoverImage,
          }],
          idx: 0, isOwner: !!currentUserId && pub.userId === currentUserId,
          ownerName: pub.displayName, ownerUserId: pub.userId, ownerAvatarUrl: pub.avatarUrl ?? null, ownerAvatarHue: pub.avatarHue ?? null,
        }
      : {
          feed: [{
            id: song.id, createdAt: '', title: song.title, prompt: '', genre: null, mood: null,
            customLyrics: null, lyrics: null, instrumental: false, audioUrl: song.audioUrl ?? '', duration: null,
            coverImage: song.coverImage ?? undefined, coverHue: song.coverHue ?? undefined,
          }],
          idx: 0, isOwner: !!currentUserId && currentUserId === ownerUserId,
          ownerName: artist, ownerUserId, ownerAvatarUrl: ownerAvatarUrl ?? null, ownerAvatarHue: ownerAvatarHue ?? null,
        }
    detailRef.current = payload
    return payload
  }

  async function openDetail() {
    window.dispatchEvent(new CustomEvent('view-song', { detail: await buildDetail() }))
  }
  async function togglePlay(e: React.MouseEvent) {
    e.stopPropagation()
    if (!song.audioUrl) return
    if (isCurrent) { player.togglePlay(); return }
    window.dispatchEvent(new CustomEvent('play-song', { detail: await buildDetail() }))
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (!isCurrent || !dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    player.seekTo(((e.clientX - rect.left) / rect.width) * dur)
  }

  return (
    <div className="relative flex gap-3.5 p-3 rounded-xl border border-white/[0.08] overflow-hidden isolate mt-2.5" style={{ background: bg }}>
      {/* 커버 블러 배경 — 노래 상세와 동일 패턴 */}
      {song.coverImage && (
        <div aria-hidden className="absolute inset-0 z-0 scale-125 blur-3xl opacity-60 pointer-events-none">
          <img src={song.coverImage} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 z-0 bg-black/25 pointer-events-none" />

      {/* 커버 썸네일 — 앱 세로 비율 2:3, 클릭 시 상세 */}
      <button onClick={openDetail} className="relative z-10 w-20 aspect-[2/3] rounded-lg overflow-hidden shrink-0 bg-black/20 ring-1 ring-inset ring-white/[0.08] cursor-pointer transition hover:opacity-90 active:scale-[0.97]">
        {song.coverImage && <img src={song.coverImage} alt="" className="w-full h-full object-cover" />}
      </button>
      <div className="relative z-10 min-w-0 flex-1 flex flex-col">
        {/* 상단: 제목·작성자 */}
        <button onClick={openDetail} className="block max-w-full text-left">
          <p className="text-base font-bold text-white truncate pr-12 [text-shadow:0_1px_3px_rgba(0,0,0,0.35)] hover:underline">{song.title || '제목 없음'}</p>
        </button>
        <p className="text-[13px] text-white/70 truncate mt-0.5">{artist ?? '익명'}</p>
        {/* 하단: 진행바(풀 폭) + 큰 재생 버튼 — 바닥에 앵커 */}
        <div className="mt-auto flex items-center gap-2.5 pt-3">
          <span className="text-[10px] text-white/70 tabular-nums shrink-0 w-8 text-right">{fmt(cur)}</span>
          <div className="flex-1 h-1 rounded-full bg-white/25 relative cursor-pointer" onClick={seek}>
            <div className="absolute inset-y-0 left-0 bg-white rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-white/70 tabular-nums shrink-0 w-8">{isCurrent ? fmt(dur - cur) : ''}</span>
          <button onClick={togglePlay} disabled={!song.audioUrl}
            className="w-11 h-11 rounded-full bg-white hover:bg-zinc-100 flex items-center justify-center shrink-0 transition active:scale-[0.94] hover:scale-105 disabled:opacity-40 shadow-lg">
            <Image src={playing ? '/Pause.svg' : '/Play.svg'} alt={playing ? '일시정지' : '재생'} width={24} height={24} />
          </button>
        </div>
      </div>
      <Image src="/logo.svg" alt="MONO" width={44} height={10} className="absolute z-10 top-2.5 right-3 opacity-50 pointer-events-none" style={{ filter: 'invert(1)' }} />
    </div>
  )
}
