'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'

const HERO_TITLES = [
  '듣지만 말고, 이제는 만들 시간',
  '악보는 몰라도 느낌만으로',
  '키워드가 음악이 되는 순간',
  '어떤 장르를 원하시나요?',
  '오늘의 무드를 연주해볼까요',
  '원하는 음악의 느낌을 한 줄로',
  '이런 노래가 있었으면',
  '오늘부터 내가 프로듀서',
  '지금 이 순간 필요한 배경음악',
  '나의 첫 번째 플레이리스트',
]

const PLACEHOLDER_EXAMPLES = [
  '달의 뒷면에서 열린 별들의 K-pop 라이브',                   // K-pop
  '마법사의 묘약이 보글거리는 로파이 비트',                   // 로파이
  '고래 등을 타고 떠나는 추억의 트로트 여행',                 // 트로트
  '햇살 가득한 야자수 섬, 거북이들의 레게 축제',              // 레게
  '구름 위 천사들이 부르는 거룩한 가스펠 합창',               // 가스펠
  '정글 한가운데 표범들의 뜨거운 살사 라틴',                  // 라틴
  '구름 양들이 통통 튀는 풀밭의 동요',                        // 동요
  '거대 로봇이 부르는 외로운 기계의 발라드',                  // 발라드
  '사이버펑크 도시 골목, 비 내리는 밤의 시티팝',              // 팝
  '달빛 아래 빌딩 옥상, 별을 세는 R&B',                       // R&B
  '지하철 끝역에서 만난 도시 힙합 비트',                      // 힙합
  '북극 오로라 아래 춤추는 곰들의 잔잔한 재즈',               // 재즈
  '오래된 등대지기 할아버지가 부르는 포크송',                 // 포크
  '초고속 우주선 추격전 같은 신스웨이브 락',                  // 락
  '심해 고대 도시에서 깨어난 몽환적인 일렉트로닉',            // 일렉트로닉
  '고양이 카페에서 들려오는 그루브한 펑크',                   // 펑크
  '70년대 우주 정거장의 화려한 디스코 파티',                  // 디스코
  '황금빛 사막을 횡단하는 카우보이의 컨트리',                 // 컨트리
  '달빛 호수에 비친 백조의 클래식 피아노',                    // 클래식
]
// 탐색 페이지 상단 hero — Suno 스타일 심플 입력
// 배경은 ExplorePanel 최상위의 AuroraBackground가 fixed로 깔아줌
// 제출 시 prompt를 sessionStorage에 보관해 /(만들기)에서 SongForm이 prefill로 소비
export function ExploreHero() {
  const router = useRouter()
  const { user } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 마운트 시 1회만 랜덤 — Hydration 안정성을 위해 useState lazy init 후 클라이언트에서만 변경
  const [placeholder] = useState(
    () => PLACEHOLDER_EXAMPLES[Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length)],
  )
  const [title] = useState(
    () => HERO_TITLES[Math.floor(Math.random() * HERO_TITLES.length)],
  )

  // Auto-grow textarea: 2줄 시작 → 4줄까지 늘어남 → 그 이상은 내부 스크롤
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const cs = window.getComputedStyle(ta)
    const lineH = parseFloat(cs.lineHeight) || 24
    const padTop = parseFloat(cs.paddingTop) || 0
    const padBot = parseFloat(cs.paddingBottom) || 0
    const maxH = lineH * 4 + padTop + padBot
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`
  }, [prompt])

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (submitting) return
    const trimmed = prompt.trim()

    // 비로그인 — 로그인 팝업만 띄우고 페이지 이동 X (입력값 유지)
    if (!user) {
      window.dispatchEvent(new Event('open-login'))
      return
    }

    setSubmitting(true)
    if (trimmed && typeof window !== 'undefined') {
      sessionStorage.setItem('mono.songform.prefill', trimmed)
      // 자동 제출 플래그 — SongForm이 prefill 적용 후 즉시 generate 호출
      sessionStorage.setItem('mono.songform.autosubmit', '1')
    }
    router.push('/')
  }

  return (
    <div className="relative mb-8">
      <div className="md:px-10 pt-20 pb-12 md:py-20 flex flex-col items-center text-center">
        <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight drop-shadow-lg">
          {title}
        </h1>

        <form
          onSubmit={handleSubmit}
          className="mt-7 md:mt-9 w-full max-w-2xl flex flex-col gap-2 rounded-2xl md:rounded-3xl p-4 md:p-5 bg-white/[0.08] border border-white/20 backdrop-blur-3xl backdrop-saturate-200 shadow-[0_8px_32px_0_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.12)]"
        >
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            maxLength={200}
            rows={2}
            className="w-full bg-transparent text-sm md:text-base text-white placeholder:text-zinc-400 focus:outline-none resize-none leading-relaxed overflow-y-auto"
          />
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="shrink-0 inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 md:px-5 py-2 md:py-2.5 rounded-full transition-colors disabled:opacity-60"
            >
              <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
              만들기
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
