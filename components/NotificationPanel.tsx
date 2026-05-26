// Design Ref: notifications §5.1·§5.2 — 데스크톱 오버레이 / 모바일 풀페이지
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { notificationService } from '@/services/notification.service'
import { exploreService } from '@/services/explore.service'
import { NotificationItem } from './NotificationItem'
import type { Notification } from '@/types/domain'

interface Props {
  mode: 'overlay' | 'page'
  onClose?: () => void  // overlay 전용
}

export function NotificationPanel({ mode, onClose }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<Notification[] | null>(null)

  const load = useCallback(async () => {
    const list = await notificationService.list(30)
    setItems(list)
  }, [])

  useEffect(() => { load() }, [load])

  // overlay: ESC로 닫기 + notifications-changed로 재로드
  useEffect(() => {
    if (mode !== 'overlay') return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  useEffect(() => {
    function onChanged() { load() }
    window.addEventListener('notifications-changed', onChanged)
    return () => window.removeEventListener('notifications-changed', onChanged)
  }, [load])

  async function handleClick(n: Notification) {
    if (!n.readAt) {
      await notificationService.markAsRead(n.id)
      window.dispatchEvent(new Event('notifications-changed'))
    }

    // 타입별 라우팅
    if ((n.type === 'like' || n.type === 'song_complete' || n.type === 'comment') && n.songId) {
      // 공개 곡 fetch → view-song 디스패치
      const pub = await exploreService.getPublicSongById(n.songId)
      if (pub) {
        window.dispatchEvent(new CustomEvent('view-song', {
          detail: {
            feed: [{
              id: pub.id, createdAt: pub.createdAt, title: pub.title, prompt: pub.prompt,
              genre: pub.genre, mood: pub.mood, customLyrics: null, lyrics: pub.lyrics,
              instrumental: pub.instrumental, audioUrl: pub.audioUrl, duration: pub.duration ?? null,
              liked: pub.isLiked, coverHue: pub.coverHue, coverImage: pub.coverImage,
            }],
            idx: 0,
            isOwner: false,
            ownerName: pub.displayName,
            ownerAvatarUrl: pub.avatarUrl ?? null,
            ownerAvatarHue: pub.avatarHue ?? null,
          },
        }))
      }
    } else if (n.type === 'follow' && n.actorName) {
      // ProfilePanel은 username 기준. actorName이 displayName인 경우가 있어 actorId로 username 조회는 별도. 1차: actorName 사용 시도
      window.dispatchEvent(new CustomEvent('view-profile', { detail: n.actorName }))
    } else if (n.type === 'system') {
      const payload = n.payload as { url?: string }
      if (payload?.url) router.push(payload.url)
    }

    if (mode === 'overlay') onClose?.()
  }

  // 컨테이너 스타일은 모드별
  const containerClass = mode === 'overlay'
    ? 'fixed left-[240px] top-[64px] bottom-[156px] w-[360px] z-[58] bg-[#1c1c1e] border-r border-white/[0.08] flex flex-col shadow-2xl animate-[slideInLeft_200ms_ease-out]'
    : 'flex flex-col h-full'

  return (
    <>
      {mode === 'overlay' && (
        <button
          aria-label="알림 닫기"
          onClick={onClose}
          className="fixed inset-0 left-[240px] z-[57] bg-transparent cursor-default"
        />
      )}
      <div className={containerClass} role={mode === 'overlay' ? 'dialog' : undefined} aria-label="알림">
        <div className="px-4 py-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-base font-semibold text-white">알림</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items === null ? (
            <div className="px-4 py-6 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded bg-white/[0.04] shimmer" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-500 text-sm">
              <p>아직 받은 알림이 없어요</p>
              <p className="text-xs text-zinc-600 mt-2">곡을 공유하거나 새 곡을 만들어보세요</p>
            </div>
          ) : (
            items.map((n) => <NotificationItem key={n.id} notif={n} onClick={() => handleClick(n)} />)
          )}
        </div>
      </div>
    </>
  )
}
