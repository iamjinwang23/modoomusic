// Design Ref: video-cover §7.1 — 비디오 커버 생성 모달
// 모드(이미지/텍스트) + 티어(512P/768P) 선택 → 생성 요청 → video-status 폴링 → 미리보기.
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'
import { songService } from '@/services/song.service'
import type { VideoCoverMode, VideoCoverTier } from '@/types/domain'

interface Props {
  open: boolean
  songId: string
  title?: string | null
  coverImage?: string
  onClose: () => void
  onCompleted?: (videoUrl: string) => void
}

const TIERS: { key: VideoCoverTier; label: string; res: string; cr: number }[] = [
  { key: 'basic', label: '기본', res: '512P', cr: 10 },
  { key: 'hd', label: '고화질', res: '768P', cr: 20 },
]

type Phase = 'idle' | 'generating' | 'done' | 'failed'

export function VideoCoverModal({ open, songId, title, coverImage, onClose, onCompleted }: Props) {
  const { profile, refreshProfile } = useAuth()
  const trial = profile?.videoTrialRemaining ?? 0

  const [mode, setMode] = useState<VideoCoverMode>(coverImage ? 'image_to_video' : 'text_to_video')
  const [tier, setTier] = useState<VideoCoverTier>('basic')
  const [motionPrompt, setMotionPrompt] = useState('')
  const [textPrompt, setTextPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [needUpgrade, setNeedUpgrade] = useState(false)
  // 모달을 연 시점의 곡으로 고정 — 재생 곡이 바뀌어도 모달 정보는 불변
  const [snap, setSnap] = useState<{ songId: string; title?: string | null; coverImage?: string } | null>(null)
  // 사용자가 업로드해 교체한 이미지(data URL) — image_to_video의 first frame으로 사용. DB 저장 안 함.
  const [customImage, setCustomImage] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeSongId = snap?.songId ?? songId
  const activeCover = snap?.coverImage ?? coverImage
  // 교체 이미지 우선, 없으면 곡 커버
  const sourceImage = customImage ?? activeCover

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  // 언마운트 시 폴링 정리
  useEffect(() => () => stopPoll(), [stopPoll])
  // open 토글: 열리면 그 시점 곡으로 고정 + 상태 초기화 / 닫히면 정리
  useEffect(() => {
    if (open) {
      setSnap({ songId, title, coverImage })
      setMode(coverImage ? 'image_to_video' : 'text_to_video')
      setTier('basic'); setMotionPrompt(''); setTextPrompt(''); setCustomImage(null)
      setPhase('idle'); setVideoUrl(null); setError(''); setNeedUpgrade(false)
    } else {
      stopPoll(); setSnap(null)
    }
    // 열린 시점의 props만 캡처 — 이후 props 변경엔 반응하지 않음(의도)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const tierInfo = TIERS.find((t) => t.key === tier)!

  const startPolling = useCallback(() => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/songs/${activeSongId}/video-status`)
        const d = await res.json()
        if (d.status === 'done') {
          stopPoll(); setPhase('done'); setVideoUrl(d.videoCoverUrl ?? null)
          // 고정된 곡(activeSongId)만 패치 — 재생 곡이 바뀌어도 올바른 곡에 반영
          songService.applyRowPatch(activeSongId, { videoCoverStatus: 'done', videoCoverUrl: d.videoCoverUrl ?? undefined })
          onCompleted?.(d.videoCoverUrl)
        } else if (d.status === 'failed') {
          stopPoll(); setPhase('failed'); setError('영상 생성에 실패했어요. 체험권·크레딧은 환불됐어요')
          refreshProfile()
        }
      } catch { /* 다음 폴링 재시도 */ }
    }, 5000)
  }, [activeSongId, stopPoll, onCompleted, refreshProfile])

  // 이미지 교체 — 클라에서 1024px·JPEG로 축소해 data URL로 보관(업로드 페이로드 최소화)
  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('이미지 파일만 올릴 수 있어요'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        const MAX = 1024
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const s = MAX / Math.max(width, height)
          width = Math.round(width * s); height = Math.round(height * s)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { setCustomImage(reader.result as string); return }
        ctx.drawImage(img, 0, 0, width, height)
        setCustomImage(canvas.toDataURL('image/jpeg', 0.85))
        setError('')
      }
      img.onerror = () => setError('이미지를 읽을 수 없어요')
      img.src = reader.result as string
    }
    reader.onerror = () => setError('이미지를 읽을 수 없어요')
    reader.readAsDataURL(file)
  }

  async function handleGenerate() {
    setError(''); setNeedUpgrade(false)
    if (mode === 'text_to_video' && !textPrompt.trim()) { setError('장면을 묘사해 주세요'); return }
    setPhase('generating')
    try {
      const res = await fetch(`/api/songs/${activeSongId}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, tier,
          motionPrompt: motionPrompt.trim() || undefined,
          textPrompt: textPrompt.trim() || undefined,
          // 교체 이미지가 있으면 그 이미지로 image_to_video 생성
          imageData: mode === 'image_to_video' && customImage ? customImage : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.status === 402) { setPhase('idle'); setNeedUpgrade(true); setError('크레딧이 부족해요'); return }
      if (res.status === 409) { setPhase('generating'); startPolling(); return } // 이미 생성 중 → 폴링 합류
      if (!res.ok) { setPhase('failed'); setError(d.message || '생성 요청에 실패했어요'); return }
      refreshProfile() // 체험권 차감 반영
      // 교체 이미지를 커버로 반영했으면 캐시도 즉시 갱신(썸네일=영상 소스 일치)
      if (d.coverImage) songService.applyRowPatch(activeSongId, { coverImage: d.coverImage })
      startPolling()
    } catch {
      setPhase('failed'); setError('네트워크 오류가 발생했어요')
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={phase === 'generating' ? undefined : onClose} />
      <div className="relative w-full md:w-[480px] max-h-[90dvh] overflow-y-auto bg-[#181B22] border border-white/[0.10] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-semibold text-white">영상 커버 만들기</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-zinc-400">✕</button>
        </header>

        <div className="p-5 space-y-4">
          {/* 미리보기 (상단) — 곡 상세 커버와 유사한 컴팩트 크기, 중앙 배치 */}
          <div className="relative w-48 aspect-[2/3] mx-auto rounded-xl overflow-hidden bg-black/30 flex items-center justify-center">
            {phase === 'done' && videoUrl ? (
              <video src={videoUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
            ) : phase === 'generating' ? (
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-500">
                <Image src="/Sparkles.svg" alt="" width={28} height={28} style={{ filter: 'invert(0.5)' }} />
                <p className="text-sm">생성된 영상이 여기 나타나요</p>
              </div>
            )}
          </div>

          {/* 입력 카드 — 탭 + 프롬프트 + 컨트롤 (Suno 구성) */}
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 space-y-3">
            {/* 탭 (활성만 언더라인, 전체 구분선 없음) */}
            <div className="flex gap-4">
              {([['image_to_video', '이미지 → 영상'], ['text_to_video', '텍스트 → 영상']] as const).map(([k, label]) => {
                const disabled = k === 'image_to_video' && !sourceImage
                return (
                  <button
                    key={k}
                    disabled={disabled || phase === 'generating'}
                    onClick={() => setMode(k)}
                    className={`pb-2 -mb-px text-sm font-medium border-b-2 transition-colors disabled:opacity-30 ${mode === k ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* 프롬프트 행 — 이미지모드: 썸네일 칩(클릭 시 이미지 교체) + textarea / 텍스트모드: textarea */}
            <div className="flex gap-2.5">
              {mode === 'image_to_video' && sourceImage && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={phase === 'generating'}
                  title="이미지 변경"
                  className="group/thumb relative h-14 aspect-[2/3] rounded-lg overflow-hidden shrink-0 border border-white/[0.08] bg-cover bg-center disabled:opacity-50"
                  style={{ backgroundImage: `url("${sourceImage}")` }}
                >
                  {/* 변경 아이콘 — 모바일 항상 노출 / 데스크톱 호버 시 */}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-100 md:opacity-0 md:group-hover/thumb:opacity-100 transition-opacity">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePickImage} className="hidden" />
              <textarea
                value={mode === 'image_to_video' ? motionPrompt : textPrompt}
                onChange={(e) => mode === 'image_to_video' ? setMotionPrompt(e.target.value) : setTextPrompt(e.target.value)}
                placeholder={mode === 'image_to_video' ? '어떻게 움직일지 설명해 주세요 (선택)' : '장면을 묘사해 주세요 — 예: 노을 지는 해변, 파도가 밀려오는 풍경'}
                disabled={phase === 'generating'}
                className="flex-1 h-14 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none resize-none disabled:opacity-50"
              />
            </div>

            {/* 컨트롤 행 — 티어 세그먼트 + 길이 */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.08] p-0.5">
                {TIERS.map((t) => (
                  <button
                    key={t.key}
                    disabled={phase === 'generating'}
                    onClick={() => setTier(t.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${tier === t.key ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-white'}`}
                  >
                    {t.label} {t.res} · {t.cr}cr
                  </button>
                ))}
              </div>
              <span className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400">6초</span>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* CTA — 음악 만들기 버튼 구성 (Sparkles + 크레딧) */}
          {needUpgrade ? (
            <button
              onClick={() => { window.dispatchEvent(new Event('open-coming-soon')); onClose() }}
              className="w-full rounded-xl py-4 font-semibold text-sm bg-white text-zinc-900 hover:bg-zinc-200 transition-colors"
            >
              플랜 업그레이드
            </button>
          ) : phase === 'done' ? (
            <button onClick={onClose} className="w-full rounded-xl py-4 font-semibold text-sm bg-white text-zinc-900 hover:bg-zinc-200 transition-colors">
              완료
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={phase === 'generating'}
              className={`w-full rounded-xl py-4 font-semibold text-sm transition-colors ${phase === 'generating' ? 'shimmer bg-violet-600 text-white cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}
            >
              {phase === 'generating' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  생성 중…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>{phase === 'failed' ? '다시 시도' : '영상 만들기'}</span>
                  <span className="inline-flex items-center gap-1">
                    <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
                    <span className="font-extrabold tabular-nums">{trial > 0 ? '무료' : tierInfo.cr}</span>
                  </span>
                </span>
              )}
            </button>
          )}

          {/* 비동기 안내 */}
          <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
            영상 생성은 최대 몇 분 걸려요. 창을 닫아도 완료되면 알림으로 알려드려요.{trial > 0 ? ` · 무료 체험권 ${trial}회 남음` : ''}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
