'use client'

import Image from 'next/image'
import { BeamBorder } from '@/components/BeamBorder'

interface Props {
  onClose: () => void
  reason?: 'sidebar' | 'locked-model' | 'daily-limit'
}

const TITLES: Record<NonNullable<Props['reason']>, string> = {
  'sidebar':       '곧 다양한 플랜이 출시돼요',
  'locked-model':  '이 모델은 곧 만나볼 수 있어요',
  'daily-limit':   '오늘의 크레딧을 다 썼어요',
}

const SUBTITLES: Record<NonNullable<Props['reason']>, string> = {
  'sidebar':       '영감이 떠오른 순간, 크레딧 부족으로 멈추지 마세요',
  'locked-model':  '더 풍부한 사운드의 프리미엄 모델을 곧 출시될 플랜에서 만나보실 수 있어요',
  'daily-limit':   '내일 KST 자정에 10크레딧이 다시 채워져요. 곧 출시될 플랜으로 더 많이 즐길 수 있어요',
}

export function ComingSoonModal({ onClose, reason = 'sidebar' }: Props) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[420px] bg-[#181B22] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden">
        {/* 테두리를 따라 한 바퀴 도는 빛 */}
        <BeamBorder className="rounded-2xl" durationMs={8000} opacity={0.5} />

        {/* 이미지 헤더 — 16:9 */}
        <div className="relative aspect-video overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1518972559570-7cc1309f3229?w=900&q=85"
            alt=""
            fill
            className="object-cover"
            sizes="420px"
            unoptimized
            priority={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#181B22]/40" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors backdrop-blur"
            title="닫기"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          <h2 className="text-lg font-bold text-white">{TITLES[reason]}</h2>
          <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{SUBTITLES[reason]}</p>

          <ul className="mt-5 space-y-2.5">
            <Feature title="더 많은 월간 크레딧" />
            <Feature title="더 빠른 음악 생성" />
            <Feature title="고품질 MP3·WAV 다운로드" />
            <Feature title="나만의 MV 생성" />
            <Feature title="상업적 이용 가능" />
          </ul>

          <button
            onClick={onClose}
            className="mt-6 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            지금은 Free로 충분해요
          </button>
        </div>
      </div>
    </div>
  )
}

function Feature({ title }: { title: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-zinc-300">
      <span className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center">
        <Image src="/Check.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
      </span>
      <span>{title}</span>
    </li>
  )
}
