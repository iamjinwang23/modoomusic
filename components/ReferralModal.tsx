'use client'

// Design Ref: referral §5.1 — 친구 초대 모달 (링크 복사 + Web Share API)

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'
import { track, EVENTS } from '@/utils/analytics'
import { BeamBorder } from '@/components/BeamBorder'

interface Props {
  open: boolean
  onClose: () => void
}

interface ReferralData {
  code: string
  count: number
  bonus_received: number
}

export function ReferralModal({ open, onClose }: Props) {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/referral/me')
      .then(r => r.json())
      .then(d => { setData(d.data ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open])

  const link = data ? `https://modoomusic.com/?ref=${data.code}` : ''

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success('초대 링크 복사됨')
      track(EVENTS.REFERRAL_SHARE, { method: 'copy' })
    } catch {
      toast.error('복사에 실패했어요')
    }
  }

  async function share() {
    if (!link) return
    if (typeof navigator.share !== 'function') {
      copy()
      return
    }
    try {
      await navigator.share({
        title: 'MONO에서 같이 음악 만들어요',
        text: '친구 초대 링크로 가입하면 보너스 크레딧 10개 받아요',
        url: link,
      })
      track(EVENTS.REFERRAL_SHARE, { method: 'native_share' })
    } catch {
      // 사용자 취소 — 조용히 무시
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#181B22] border border-white/[0.10] rounded-2xl w-full max-w-[400px] max-h-[92vh] shadow-2xl overflow-hidden flex flex-col">
        {/* 테두리 빛 효과 — ComingSoonModal과 동일 */}
        <BeamBorder className="rounded-2xl" durationMs={8000} opacity={0.5} />

        {/* 닫기 — 배너 위에 오버레이 */}
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-black/60 hover:bg-white flex items-center justify-center text-white hover:text-zinc-900 transition-colors z-20"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </button>

        {/* 상단 배너 — portrait, 하단 그라데이션으로 페이드아웃 */}
        <div className="relative w-full aspect-[3/4] shrink-0 bg-black">
          <Image
            src="/referral-banner.png"
            alt="친구 초대 보너스"
            fill
            sizes="400px"
            className="object-cover"
            priority={false}
          />
          {/* 하단 페이드 그라데이션 — 모달 배경색으로 자연스럽게 연결 */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#181B22] via-[#181B22]/80 to-transparent pointer-events-none" />
        </div>

        {/* 하단 콘텐츠 — 그라데이션 위로 살짝 걸침 (-mt-12) */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 -mt-12 relative z-10">

        {/* 카운터 — 두 박스로 분리, 로딩 중에도 자리 유지 */}
        <div className="mb-5 grid grid-cols-2 gap-2">
          <div className="p-4 rounded-xl bg-white/[0.04]">
            <p className="text-xs text-zinc-400">초대 완료</p>
            <p className="text-2xl font-bold text-white mt-2">
              {loading ? '–' : data?.count ?? 0}
              <span className="text-base text-zinc-500">/10명</span>
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.04]">
            <p className="text-xs text-zinc-400">받은 보너스</p>
            <p className="text-2xl font-bold text-violet-400 mt-2">
              {loading ? '–' : data?.bonus_received ?? 0}
              <span className="text-base text-zinc-500">/100크레딧</span>
            </p>
          </div>
        </div>

        {/* 초대 링크 */}
        <div className="mb-3">
          <p className="text-xs text-zinc-400 mb-2">초대 링크</p>
          <input
            type="text"
            value={link}
            readOnly
            placeholder={loading ? '불러오는 중…' : ''}
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none"
            onClick={(e) => e.currentTarget.select()}
          />
        </div>

        {/* 링크 복사 — 메인 CTA */}
        <button
          onClick={copy}
          disabled={!link}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors disabled:opacity-50"
        >
          초대 링크 복사
        </button>

        {/* 공유하기 — 모바일 보조 (native share sheet) */}
        <button
          onClick={share}
          disabled={!link}
          className="md:hidden w-full mt-2 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-zinc-200 font-medium transition-colors disabled:opacity-50"
        >
          공유하기
        </button>
        </div>{/* 우측 콘텐츠 끝 */}
      </div>
    </div>
  )
}
