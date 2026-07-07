'use client'

import type { SocialLinks } from '@/types/domain'

type Key = keyof SocialLinks

const ORDER: Key[] = ['instagram', 'tiktok', 'youtube', 'facebook', 'x']

const LABEL: Record<Key, string> = {
  instagram: '인스타그램',
  tiktok:    '틱톡',
  youtube:   '유튜브',
  facebook:  '페이스북',
  x:         'X',
}

function Icon({ kind, className }: { kind: Key; className?: string }) {
  switch (kind) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M14 3h2.6a5.4 5.4 0 0 0 4.4 4.4V10a8 8 0 0 1-4.4-1.32V15a6 6 0 1 1-6-6c.34 0 .68.03 1 .09v2.7A3.3 3.3 0 1 0 14 15Z"/>
        </svg>
      )
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z"/>
        </svg>
      )
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.7c0-.93.26-1.56 1.6-1.56h1.7V4.3c-.3-.04-1.3-.13-2.46-.13-2.44 0-4.1 1.49-4.1 4.22v2.4H7.5V14h2.74v8h3.26Z"/>
        </svg>
      )
    case 'x':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M18.2 3h2.93l-6.4 7.31L22 21h-5.78l-4.52-5.92L6.5 21H3.56l6.84-7.82L3 3h5.9l4.08 5.4L18.2 3Zm-1.02 16.2h1.62L7.94 4.7H6.2L17.18 19.2Z"/>
        </svg>
      )
  }
}

export function SocialLinksRow({ links, className = '' }: { links: SocialLinks; className?: string }) {
  const items = ORDER.filter((k) => !!links[k])
  if (items.length === 0) return null
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {items.map((k) => (
        <a
          key={k}
          href={links[k]!}
          target="_blank"
          rel="noopener noreferrer"
          title={LABEL[k]}
          className="w-[35px] h-[35px] rounded-full flex items-center justify-center text-zinc-300 bg-white/[0.06] hover:bg-white/[0.12] hover:text-white transition-colors"
        >
          <Icon kind={k} className="w-[15px] h-[15px]" />
        </a>
      ))}
    </div>
  )
}
