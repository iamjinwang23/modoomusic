// Design Ref: notifications §5.3 — 타입별 분기 렌더 + 클릭 시 라우팅 + read 처리
'use client'

import Image from 'next/image'
import { profileColor } from '@/utils/profileColor'
import { relativeTime } from '@/utils/relativeTime'
import type { Notification, NotificationSystemPayload } from '@/types/domain'

interface Props {
  notif: Notification
  onClick: () => void
}

function avatarLetter(name: string | null): string {
  return (name ?? '?').slice(0, 1).toUpperCase()
}

function renderText(n: Notification): React.ReactNode {
  const actor = <span className="text-white font-medium">{n.actorName ?? '누군가'}</span>
  const title = <span className="text-white">{n.songTitle ?? '곡'}</span>
  switch (n.type) {
    case 'like':
      return <>{actor}님이 {title}를 좋아했어요</>
    case 'song_complete':
      return <>{title} 생성이 완료되었어요</>
    case 'follow':
      return <>{actor}님이 회원님을 팔로우했어요</>
    case 'comment':
      return <>{actor}님이 댓글을 남겼어요</>
    case 'system': {
      const p = (n.payload as NotificationSystemPayload) ?? { title: '', body: '' }
      return (
        <>
          <span className="text-white font-medium">{p.title || '공지'}</span>
          {p.body && <span className="block text-zinc-400 text-xs mt-0.5 line-clamp-2">{p.body}</span>}
        </>
      )
    }
  }
}

export function NotificationItem({ notif, onClick }: Props) {
  const unread = !notif.readAt
  const c = profileColor(notif.actorAvatarHue ?? 0)

  // 좌측 비주얼: system은 곡커버 또는 sparkles, 그 외는 actor 아바타
  const visual = notif.type === 'system' ? (
    <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
      <Image src="/Sparkles.svg" alt="" width={18} height={18} style={{ filter: 'invert(1)' }} />
    </div>
  ) : notif.type === 'song_complete' && notif.songCoverImage ? (
    <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0">
      <Image src={notif.songCoverImage} alt="" fill className="object-cover" sizes="40px" unoptimized />
    </div>
  ) : notif.actorAvatarUrl ? (
    <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
      <Image src={notif.actorAvatarUrl} alt={notif.actorName ?? ''} fill className="object-cover" sizes="40px" unoptimized />
    </div>
  ) : (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{ background: c.bg, color: c.text }}
    >
      {avatarLetter(notif.actorName)}
    </div>
  )

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.06] ${
        unread ? 'bg-violet-500/[0.06]' : ''
      }`}
    >
      {visual}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-200 leading-snug truncate">{renderText(notif)}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{relativeTime(notif.createdAt)}</p>
      </div>
      {unread && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
    </button>
  )
}
