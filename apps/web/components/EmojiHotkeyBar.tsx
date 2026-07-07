'use client'
// Design Ref: comments §5.1 — Suno 7개 이모지 핫키 + "+" 자리(곧 출시)
import { toast } from '@/components/toast/toast'

const EMOJIS = ['🔥', '😍', '😭', '🙌', '👍', '😎', '😋'] as const

interface Props {
  onInsert: (emoji: string) => void
  disabled?: boolean
}

export function EmojiHotkeyBar({ onInsert, disabled = false }: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          disabled={disabled}
          onClick={() => onInsert(e)}
          className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-lg leading-none transition-colors disabled:opacity-40"
          aria-label={`이모지 ${e}`}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        onClick={() => toast.info('곧 출시될 기능이에요')}
        className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        aria-label="이모지 더 보기"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M7 1v12M1 7h12" />
        </svg>
      </button>
    </div>
  )
}
