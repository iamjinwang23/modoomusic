// Design Ref: notifications §5.1·§5.2 — 데스크톱 오버레이 / 모바일 풀페이지
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { notificationService } from '@/services/notification.service'
import { exploreService } from '@/services/explore.service'
import { useAuth } from '@/components/AuthProvider'
import { NotificationItem } from './NotificationItem'
import type { Notification } from '@/types/domain'

interface Props {
  mode: 'overlay' | 'page'
  onClose?: () => void  // overlay 전용
}

export function NotificationPanel({ mode, onClose }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const [items, setItems] = useState<Notification[] | null>(null)

  const load = useCallback(async () => {
    const list = await notificationService.list(30)
    setItems(list)
  }, [])

  useEffect(() => { load() }, [load])

  // 자동 일괄 읽음 처리는 제거 — 사용자 의도와 안 맞음.
  // 개별 알림을 누르면 그 알림만 읽음 처리(handleClick). 일괄 처리는 헤더의 "모두 읽음" 버튼으로.

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
      // 곡 fetch → view-song 디스패치. song_complete는 본인 비공개 곡이라 is_public 필터 없는 getSongById 사용
      // (RLS가 소유자만 비공개 접근 허용). like/comment 대상 곡도 동일하게 조회됨.
      const pub = await exploreService.getSongById(n.songId)
      if (pub) {
        window.dispatchEvent(new CustomEvent('view-song', {
          detail: {
            feed: [{
              id: pub.id, createdAt: pub.createdAt, title: pub.title, prompt: pub.prompt,
              genre: pub.genre, mood: pub.mood, customLyrics: null, lyrics: pub.lyrics,
              instrumental: pub.instrumental, audioUrl: pub.audioUrl, duration: pub.duration ?? null,
              liked: pub.isLiked, coverHue: pub.coverHue, coverImage: pub.coverImage,
              publishComment: pub.publishComment,
              published: pub.published,
              commentCount: pub.commentCount,
              model: pub.model,
              videoCoverUrl: pub.videoCoverUrl,
              videoCoverStatus: pub.videoCoverStatus,
            }],
            idx: 0,
            isOwner: !!user && pub.userId === user.id,
            ownerUserId: pub.userId,
            ownerName: pub.displayName,
            ownerAvatarUrl: pub.avatarUrl ?? null,
            ownerAvatarHue: pub.avatarHue ?? null,
          },
        }))
      }
    } else if (n.type === 'follow') {
      // social-actions §5.5 — payload.username 우선 (follow API가 INSERT 시 채움). 없으면 actorName fallback
      const payload = n.payload as { username?: string }
      const username = payload?.username || n.actorName
      if (username) window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))
    } else if (n.type === 'system') {
      const payload = n.payload as { url?: string }
      if (payload?.url) router.push(payload.url)
    }

    if (mode === 'overlay') onClose?.()
  }

  // overlay 모드: main 본문 좌측에서 고정 폭(400px)으로 슬라이드인. 우측은 본문 보임
  const containerClass = mode === 'overlay'
    ? 'absolute inset-y-0 left-0 w-[400px] z-[58] bg-gradient-to-b from-[#111318] from-50% to-[#12151E] border-r border-white/[0.06] flex flex-col shadow-2xl notif-slide-in'
    : 'flex flex-col h-full'

  return (
    <>
      {/* notifications §5.1 — 데스크톱 오버레이: 우측 본문 dim scrim. 클릭 시 패널 닫힘 (패널 z-[58]보다 한 단계 아래) */}
      {mode === 'overlay' && (
        <div
          className="absolute inset-0 z-[57] bg-black/40 animate-[fadeIn_320ms_ease-out]"
          onClick={() => onClose?.()}
          aria-hidden="true"
        />
      )}
      <div className={containerClass} role={mode === 'overlay' ? 'dialog' : undefined} aria-label="알림">
        {/* 헤더 — 페이지 헤더 톤 (text-xl), 하단 border 없음 + "모두 읽음" 버튼 (미읽음 있을 때만) */}
        <div className="px-6 py-5 shrink-0 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">알림</h2>
          {(items?.some((n) => !n.readAt) ?? false) && (
            <button
              onClick={async () => {
                await notificationService.markAllAsRead()
                window.dispatchEvent(new Event('notifications-changed'))
              }}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              모두 읽음
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {items === null ? (
            <div className="py-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="px-6 py-3 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/[0.04] shimmer shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2 pt-1">
                    <div className="h-3.5 w-3/4 rounded bg-white/[0.04] shimmer" />
                    <div className="h-3 w-16 rounded bg-white/[0.04] shimmer" />
                  </div>
                </div>
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
