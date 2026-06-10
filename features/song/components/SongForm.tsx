'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import Image from 'next/image'
import { useSongGeneration } from '../hooks/useSongGeneration'
import { MODELS, creditsForModel, type MusicModelId } from '@/services/minimax.service'
import { useAuth } from '@/components/AuthProvider'
import { GeneratingPhrase } from '@/components/GeneratingPhrase'
import { toast } from '@/components/toast/toast'
import { RefAudioTrimModal } from '@/components/RefAudioTrimModal'
import { LyricsGenerateModal } from '@/components/LyricsGenerateModal'
import { track, EVENTS } from '@/utils/analytics'

const MIN_LYRICS_LENGTH = 10  // MiniMax 최소 가사 길이
const LYRICS_MAX = 5000
const STYLE_MAX = 1000

// Suno 패턴 — 80% 도달 전엔 카운터 숨김(깔끔), 80~99% 노랑(경고), 100% 빨강(차단).
// maxLength 속성이 100% 도달 시 input 차단 처리.
function CharCount({ length, limit }: { length: number; limit: number }) {
  if (length < limit * 0.8) return null
  const atLimit = length >= limit
  return (
    <span className={`text-xs tabular-nums ${atLimit ? 'text-red-400' : 'text-amber-300'}`}>
      {length.toLocaleString()} / {limit.toLocaleString()}자
    </span>
  )
}

const ALL_CHIPS = [
  // 장르
  '발라드', '팝', 'R&B', '힙합', '재즈', '포크', '록', 'EDM', '클래식', '소울',
  '인디', '보사노바', '트로트', 'K-pop', 'J-pop', '레게', '컨트리', '블루스',
  // 분위기
  '잔잔한', '신나는', '감성적', '몽환적', '그리운', '밝은', '어두운', '우울한',
  '설레는', '웅장한', '따뜻한', '차가운', '평온한', '슬픈', '로맨틱', '긴장감',
  // BPM
  '60 BPM', '75 BPM', '90 BPM', '105 BPM', '120 BPM', '135 BPM', '150 BPM', '170 BPM',
  // 악기
  '피아노', '어쿠스틱 기타', '일렉기타', '바이올린', '첼로', '드럼', '베이스',
  '신스', '오케스트라', '플루트', '트럼펫', '색소폰',
  // 보컬
  '여성보컬', '남성보컬', '코러스', '팔세토', '보컬없음',
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function useDragResize(initialHeight: number, min = 72, max = 480) {
  const [height, setHeight] = useState(initialHeight)
  const [dragging, setDragging] = useState(false)
  const ref = useRef<{ startY: number; startH: number } | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragging(true)
    ref.current = { startY: e.clientY, startH: height }

    function onMove(e: MouseEvent) {
      if (!ref.current) return
      setHeight(Math.max(min, Math.min(max, ref.current.startH + e.clientY - ref.current.startY)))
    }
    function onUp() {
      ref.current = null
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return { height, dragging, onMouseDown, setHeight, min, max }
}

function ResizeHandle({ onMouseDown, dragging }: { onMouseDown: (e: React.MouseEvent) => void; dragging: boolean }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`h-4 flex items-center justify-center cursor-row-resize transition-opacity duration-150 ${
        dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <div className="w-8 h-1 rounded-full bg-white/30" />
    </div>
  )
}

export function SongForm() {
  const [lyrics, setLyrics] = useState('')
  const [instrumental, setInstrumental] = useState(false)
  const [stylePrompt, setStylePrompt] = useState('')
  const [title, setTitle] = useState('')
  const [refAudio, setRefAudio] = useState<File | null>(null)
  // 트림 모달 — 사용자가 파일 선택 시 모달 띄움. 모달 Save 시 트림된 WAV File로 교체
  const [pendingRefFile, setPendingRefFile] = useState<File | null>(null)
  const [refMeta, setRefMeta] = useState<{ startSec: number; endSec: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [styleRefNotice, setStyleRefNotice] = useState(false)
  const [styleRefDontShow, setStyleRefDontShow] = useState(false)
  const [vocalGender, setVocalGender] = useState<'male' | 'female' | null>(null)
  const [model, setModel] = useState<MusicModelId>('music-2.0')
  const [lyricsModalOpen, setLyricsModalOpen] = useState(false)
  // 가사 풀스크린 편집 — 폼 안에서 가사 박스가 다른 섹션 숨기고 확장.
  // ESC 키로 닫기. CSS transition으로 부드러운 확장/축소.
  const [lyricsFullscreen, setLyricsFullscreen] = useState(false)
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
  const [modelDropOpen, setModelDropOpen] = useState(false)
  const modelDropRef = useRef<HTMLDivElement>(null)

  // ExploreHero 등에서 sessionStorage로 전달한 prompt를 한 번만 소비
  const [pendingAutoSubmit, setPendingAutoSubmit] = useState(false)

  // 가사 풀스크린 ESC 닫기
  useEffect(() => {
    if (!lyricsFullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLyricsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lyricsFullscreen])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefill = sessionStorage.getItem('mono.songform.prefill')
    if (prefill) {
      setStylePrompt(prefill)
      setMode('simple')
      sessionStorage.removeItem('mono.songform.prefill')
    }
    if (sessionStorage.getItem('mono.songform.autosubmit') === '1') {
      sessionStorage.removeItem('mono.songform.autosubmit')
      setPendingAutoSubmit(true)
    }
  }, [])

  useEffect(() => {
    if (!modelDropOpen) return
    function handler(e: MouseEvent) {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) setModelDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelDropOpen])
  const refAudioInputRef = useRef<HTMLInputElement>(null)
  const { status, elapsed, error, generate, reset } = useSongGeneration()
  // Plan SC FR-04: 곡 생성 성공 시 song_generate 이벤트. ref로 마지막 생성 컨텍스트 보관 → status='done' 시 1회 발사
  const lastGenContextRef = useRef<{ genre?: string; mood?: string; mode: 'simple' | 'detail' | 'cover' } | null>(null)
  useEffect(() => {
    if (status === 'done' && lastGenContextRef.current) {
      track(EVENTS.SONG_GENERATE, lastGenContextRef.current)
      lastGenContextRef.current = null
    }
  }, [status])
  const { user } = useAuth()
  const chipScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [chips, setChips] = useState<string[]>(ALL_CHIPS.slice(0, 16))
  const lyricsResize = useDragResize(144)
  const styleResize = useDragResize(96)

  // 진입 시 viewport에 정확히 맞춰 가사·스타일 textarea 초기 높이 조정.
  // 실제 DOM을 측정해서 컬럼 가용 높이 - 고정 영역 = textarea 분배 공간 계산.
  // 가사 60% / 스타일 40% 비율. 사용자가 드래그 조절을 시작하면 자동 조정 끄기.
  const formRef = useRef<HTMLFormElement>(null)
  const lyricsRef = useRef<HTMLTextAreaElement>(null)
  const styleRef = useRef<HTMLTextAreaElement>(null)
  const autoSizedRef = useRef(false)

  const isGenerating = status === 'generating'
  // music-2.6은 참조 음원 업로드 시 cover 모드, 없으면 일반 모드
  const isCoverCapable = model === 'music-2.6'
  const isCoverRequest = isCoverCapable && !!refAudio
  // 심플 모드 모델: 보컬→2.0, 인스트루멘탈→2.6 (2.0은 인스트루멘탈 미지원)
  const simpleModel: MusicModelId = instrumental ? 'music-2.6' : 'music-2.0'
  const ctaCredits = creditsForModel(mode === 'simple' ? simpleModel : model)

  // ExploreHero에서 autosubmit 플래그를 받았으면 user·prefill 둘 다 준비된 시점에 즉시 generate
  useEffect(() => {
    if (!pendingAutoSubmit) return
    if (!user) return
    if (!stylePrompt.trim()) return
    if (isGenerating) return
    setPendingAutoSubmit(false)
    if (mode !== 'simple') setMode('simple')
    lastGenContextRef.current = { mode: 'simple' }
    generate({
      prompt: stylePrompt.trim(),
      genre: '',
      mood: '',
      title: '',
      customLyrics: '',
      instrumental,
      model: simpleModel,
      autoLyrics: !instrumental,
    })
  }, [pendingAutoSubmit, user, stylePrompt, isGenerating, mode, instrumental, simpleModel, generate])

  // 모드 영속화: 첫 진입은 심플(SSR), mount 후 마지막 선택 복원
  useEffect(() => {
    const saved = localStorage.getItem('mono.songform.mode')
    if (saved === 'advanced' || saved === 'simple') setMode(saved)
  }, [])
  function changeMode(next: 'simple' | 'advanced') {
    setMode(next)
    localStorage.setItem('mono.songform.mode', next)
  }

  // 고급 모드 진입 시 DOM을 측정해 가사·스타일 textarea 높이를 viewport에 정확히 맞춤.
  // 한 번 자동 사이징 후 ref로 잠가서 mode 토글이나 리렌더에 다시 안 건드림.
  useLayoutEffect(() => {
    if (autoSizedRef.current) return
    if (mode !== 'advanced') return
    const form = formRef.current
    const lyricsEl = lyricsRef.current
    const styleEl = styleRef.current
    if (!form || !lyricsEl || !styleEl) return
    autoSizedRef.current = true

    const column = form.closest('.overflow-y-auto') as HTMLElement | null
    const wrapper = form.parentElement
    if (!wrapper) return
    const wStyle = getComputedStyle(wrapper)
    const padTop = parseFloat(wStyle.paddingTop) || 0
    const padBot = parseFloat(wStyle.paddingBottom) || 0
    const available = (column?.clientHeight ?? window.innerHeight) - padTop - padBot

    // 폼 자식 sum + space-y-3 gap(12px) — 숨겨진 자식 제외
    const kids = Array.from(form.children) as HTMLElement[]
    let total = 0
    let visible = 0
    for (const c of kids) {
      if (getComputedStyle(c).display === 'none') continue
      total += c.offsetHeight
      visible++
    }
    const totalWithGaps = total + Math.max(0, visible - 1) * 12

    const otherFixed = totalWithGaps - lyricsEl.offsetHeight - styleEl.offsetHeight
    const room = available - otherFixed
    if (room < lyricsResize.min + styleResize.min) return

    const lyricsTarget = Math.round(room * 0.6)
    const styleTarget = Math.round(room * 0.4)
    lyricsResize.setHeight(Math.max(lyricsResize.min, Math.min(lyricsResize.max, lyricsTarget)))
    styleResize.setHeight(Math.max(styleResize.min, Math.min(styleResize.max, styleTarget)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    setChips(shuffle(ALL_CHIPS).slice(0, 16))
  }, [])

  useEffect(() => {
    if (status !== 'done') return
    reset()
    setLyrics('')
    setStylePrompt('')
    setTitle('')
    setInstrumental(false)
    setRefAudio(null)
    setVocalGender(null)
  }, [status, reset])

  function handleRefAudioFile(file: File) {
    if (!file.type.startsWith('audio/')) return
    // 파일 선택 시 즉시 setRefAudio가 아니라 트림 모달부터 띄움
    setPendingRefFile(file)
  }

  function handleRefDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleRefAudioFile(file)
  }

  function scrollChips(dir: 'left' | 'right') {
    chipScrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' })
  }

  function reshuffleChips() {
    setChips(shuffle(ALL_CHIPS).slice(0, 16))
    chipScrollRef.current?.scrollTo({ left: 0 })
    setCanScrollLeft(false)
    setCanScrollRight(true)
  }

  function handleChipScroll() {
    const el = chipScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  function addChip(chip: string) {
    setStylePrompt((prev) => (prev ? `${prev}, ${chip}` : chip))
  }

  function handleLyricsGenerated(next: string, songTitle?: string) {
    if (lyrics.trim() && !confirm('현재 가사를 새로 만든 가사로 바꿀까요?')) return
    setLyrics(next)
    if (instrumental) setInstrumental(false)  // 가사가 생겼으니 보컬 모드로
    // 제목이 비어 있을 때만 자동 채움 (사용자 입력 미덮어쓰기)
    const fillTitle = !!songTitle && !title.trim()
    if (fillTitle) setTitle(songTitle!)
    toast.success(fillTitle ? '가사와 제목을 만들었어요' : '가사를 만들었어요')
  }

  function buildPrompt() {
    const vocalTag = vocalGender === 'female' ? 'female vocals' : vocalGender === 'male' ? 'male vocals' : null
    return [stylePrompt.trim(), vocalTag].filter(Boolean).join(', ')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) {
      window.dispatchEvent(new Event('open-login'))
      return
    }
    if (!stylePrompt.trim() || isGenerating) return

    // 심플 모드: 설명만으로 서버 자동작사 → 음악 생성 (인스트루멘탈이면 작사 생략)
    if (mode === 'simple') {
      lastGenContextRef.current = { mode: 'simple' }
      generate({
        prompt: stylePrompt.trim(),
        genre: '',
        mood: '',
        title: '',
        customLyrics: '',
        instrumental,
        model: simpleModel,
        autoLyrics: !instrumental,
      })
      return
    }

    // 가사 검증: 입력은 있는데 너무 짧으면 MiniMax가 거부 → 사전 차단
    const lyricsLen = lyrics.trim().length
    if (!isCoverRequest && !instrumental && lyricsLen > 0 && lyricsLen < MIN_LYRICS_LENGTH) {
      toast.error('가사가 너무 짧아요', {
        description: `최소 ${MIN_LYRICS_LENGTH}자 이상 입력하거나, 가사를 비우면 자동으로 인스트루멘탈로 만들어요`,
      })
      return
    }

    if (isCoverRequest) {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        lastGenContextRef.current = { mode: 'cover' }
        generate({
          prompt: buildPrompt(),
          genre: '',
          mood: '',
          title,
          customLyrics: lyrics,
          instrumental: false,
          model,
          audioBase64: base64,
        })
      }
      reader.readAsDataURL(refAudio)
      return
    }

    lastGenContextRef.current = { mode: 'detail' }
    generate({
      prompt: buildPrompt(),
      genre: '',
      mood: '',
      title,
      customLyrics: instrumental ? '' : lyrics,
      instrumental,
      model,
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3 flex-1 flex flex-col min-h-0">
      {/* 스타일 참조 — cover 모델 선택 시에만 표시 */}
      <input
        ref={refAudioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRefAudioFile(f) }}
      />

      {/* Simple/Advanced 토글(중앙) + 모델 선택(우, 고급 모드만) — 좌측은 grid 균형용 빈칸.
          중앙 칸은 auto(콘텐츠 크기)로 두어 모바일 좁은 폭에서 토글 텍스트 줄바꿈 방지. */}
      <div className={`grid grid-cols-[1fr_auto_1fr] items-center ${lyricsFullscreen ? 'hidden' : ''}`}>
        <div />
        <div className="justify-self-center relative inline-flex rounded-full bg-white/[0.06] p-1">
          {/* 슬라이딩 활성 표시 — 두 버튼은 동일 폭(2글자+px-5)이라 50% 기준으로 이동 */}
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: mode === 'simple' ? 'translateX(0)' : 'translateX(100%)' }}
          />
          {(['simple', 'advanced'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={isGenerating}
              onClick={() => changeMode(m)}
              className={`relative z-10 px-5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${
                mode === m ? 'text-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {m === 'simple' ? '심플' : '고급'}
            </button>
          ))}
        </div>
        {mode === 'advanced' ? (
          <div ref={modelDropRef} className="justify-self-end relative">
            <button
              type="button"
              onClick={() => setModelDropOpen((v) => !v)}
              disabled={isGenerating}
              className={`flex items-center gap-1.5 text-sm font-semibold text-white border rounded-full px-3 h-10 transition-colors disabled:opacity-40 ${modelDropOpen ? 'border-white/30' : 'border-white/[0.10] hover:border-white/20'}`}
            >
              {(() => {
                // 칩에는 'Music 2.0' 대신 'v2.0' 형식으로 간소화 표시 (드롭다운 항목은 풀 레이블 유지)
                const fullLabel = MODELS.find((m) => m.id === model)?.label ?? ''
                const isBeta = fullLabel.includes('(beta)')
                const short = model.replace('music-', 'v')
                return (
                  <>
                    <span>{short}</span>
                    {isBeta && <span className="text-[10px] font-medium text-teal-400 bg-teal-500/15 px-1.5 py-0.5 rounded-full leading-none">beta</span>}
                  </>
                )
              })()}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${modelDropOpen ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>

            {modelDropOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-[360px] bg-[#1C1F27] border border-white/30 rounded-2xl shadow-2xl overflow-hidden z-30">
                <div className="px-3.5 pt-3 pb-2">
                  <p className="text-sm font-semibold text-white">모델 선택</p>
                </div>
                <div className="pb-1.5">
                {MODELS.map((m) => {
                  const active = model === m.id
                  const labelBase = m.label.replace(' (beta)', '')
                  const labelIsBeta = m.label.includes('(beta)')
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setModelDropOpen(false)
                        if (m.locked) {
                          window.dispatchEvent(new CustomEvent('open-coming-soon', { detail: 'locked-model' }))
                        } else {
                          setModel(m.id)
                          if (m.id === 'music-2.0' && instrumental) {
                            setInstrumental(false)
                            toast.info('Music 2.0은 인스트루멘탈을 지원하지 않아 가사 모드로 전환했어요')
                          }
                        }
                      }}
                      className={`w-full flex items-start gap-3 px-3.5 py-3 transition-colors text-left ${
                        m.locked ? 'cursor-pointer hover:bg-white/[0.03]' : active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04] cursor-pointer'
                      }`}
                    >
                      <Image src="/minimax.webp" alt="MiniMax" width={36} height={36} className={`w-9 h-9 rounded-lg object-cover shrink-0 mt-0.5 ${m.locked ? 'opacity-40' : ''}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${m.locked ? 'text-zinc-500' : active ? 'text-white' : 'text-zinc-200'}`}>{labelBase}</p>
                          {labelIsBeta && !m.locked && <span className="text-[10px] font-medium text-teal-400 bg-teal-500/15 px-1.5 py-0.5 rounded-full leading-none">beta</span>}
                          {m.locked && <span className="text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full leading-none">곧 소개 예정</span>}
                        </div>
                        <p className={`text-xs mt-0.5 leading-relaxed ${m.locked ? 'text-zinc-600' : 'text-zinc-500'}`}>{m.desc}</p>
                      </div>
                      <div className="w-5 shrink-0 flex items-center justify-center self-center">
                        {m.locked ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                            <rect x="4" y="11" width="16" height="10" rx="2"/>
                            <path d="M8 11V7a4 4 0 1 1 8 0v4"/>
                          </svg>
                        ) : active ? (
                          <Image src="/Check.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
                        ) : null}
                      </div>
                    </button>
                  )
                })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* 심플 모드: 설명 + 인스트루멘탈 + 가사로 전환 */}
      {mode === 'simple' && (
        <section className="mode-fade rounded-xl border border-white/[0.08] bg-[#1A1D24] overflow-hidden group">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">설명</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs transition-colors ${instrumental ? 'text-violet-400' : 'text-zinc-500'}`}>
                인스트루멘탈
              </span>
              <button
                type="button"
                onClick={() => setInstrumental((v) => !v)}
                disabled={isGenerating}
                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${instrumental ? 'bg-violet-600' : 'bg-zinc-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${instrumental ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
          <div className="px-4 pb-3">
            <textarea
              className="w-full bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-zinc-500 leading-relaxed"
              style={{ height: 144 }}
              placeholder={`만들고 싶은 노래를 자유롭게 적어보세요.\n제목부터 가사, 음악까지 한 번에 완성됩니다.`}
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              maxLength={STYLE_MAX}
              disabled={isGenerating}
            />
            <div className="flex items-center justify-between py-1 min-h-[28px]">
              <button
                type="button"
                onClick={() => changeMode('advanced')}
                disabled={isGenerating}
                className="flex items-center gap-1 text-sm text-white bg-[#252A35] hover:bg-[#2C313D] px-4 py-1.5 rounded-full transition-colors disabled:opacity-40"
              >
                <Image src="/Add.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
                가사
              </button>
              <CharCount length={stylePrompt.length} limit={STYLE_MAX} />
            </div>
          </div>
        </section>
      )}

      {mode === 'advanced' && (
      <div className={`mode-fade space-y-3 ${lyricsFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
      {isCoverCapable && (
        <section
          onClick={() => {
            if (isGenerating) return
            const hidden = localStorage.getItem('styleRefNoticeHidden') === 'true'
            if (hidden) { refAudioInputRef.current?.click() } else { setStyleRefNotice(true) }
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleRefDrop}
          className={`rounded-xl border bg-[#1A1D24] overflow-hidden transition-colors ${lyricsFullscreen ? 'hidden' : ''} ${
            isGenerating ? 'cursor-default opacity-60' : 'cursor-pointer'
          } ${
            isDragOver
              ? 'border-violet-400 bg-violet-500/10'
              : refAudio
              ? 'border-violet-500/60'
              : 'border-violet-500/40 hover:border-violet-500/60'
          }`}
        >
          <div className="px-4 py-4 flex items-center gap-3">
            <Image
              src="/File-Music.svg"
              alt=""
              width={36}
              height={36}
              style={{ filter: 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)', flexShrink: 0 }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-white">스타일 참조</span>
              {refAudio ? (
                <p className="text-xs text-violet-400 mt-0.5 truncate">
                  {refAudio.name}
                  {refMeta && ` · ${(refMeta.endSec - refMeta.startSec).toFixed(1)}초 (${refMeta.startSec.toFixed(1)}~${refMeta.endSec.toFixed(1)}s)`}
                </p>
              ) : (
                <p className="text-xs text-zinc-400 mt-0.5">영감을 얻기 위해 음원을 클릭하거나 드래그해서 추가하세요</p>
              )}
            </div>
            {refAudio && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setRefAudio(null); setRefMeta(null); if (refAudioInputRef.current) refAudioInputRef.current.value = '' }}
                className="shrink-0 text-zinc-500 hover:text-white transition-colors p-1"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M1 1l10 10M11 1L1 11"/>
                </svg>
              </button>
            )}
          </div>
        </section>
      )}

      {/* 가사 */}
      <section className={`rounded-xl border border-white/[0.08] bg-[#1A1D24] overflow-hidden group ${lyricsFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">가사</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-colors ${instrumental ? 'text-violet-400' : 'text-zinc-500'}`}>
              인스트루멘탈
            </span>
            <button
              type="button"
              onClick={() => {
                const next = !instrumental
                setInstrumental(next)
                if (next) {
                  setLyrics('')
                  // Music 2.0은 인스트루멘탈 미지원 → 자동으로 Music 2.6으로 전환
                  if (model === 'music-2.0') {
                    setModel('music-2.6')
                    toast.info('인스트루멘탈을 위해 Music 2.6로 변경했어요')
                  }
                }
              }}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                instrumental ? 'bg-violet-600' : 'bg-zinc-700'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                instrumental ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        {/* 가사 입력 — 인스트루멘탈 시 접힘.
            풀스크린 시 flex-1로 가용 공간을 자동 채움 (실측 계산 불필요). */}
        <div
          className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${lyricsFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}
          style={{ maxHeight: lyricsFullscreen ? 'none' : (instrumental ? 0 : lyricsResize.height + 80) }}
        >
          <div className={`px-4 ${lyricsFullscreen ? 'flex-1 flex flex-col min-h-0 pb-3' : ''}`}>
            <textarea
              ref={lyricsRef}
              className={`w-full bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-zinc-500 leading-relaxed transition-[height] duration-300 ease-out ${lyricsFullscreen ? 'flex-1 min-h-0' : ''}`}
              style={{ height: lyricsFullscreen ? 'auto' : lyricsResize.height }}
              placeholder={`직접 가사를 입력하세요 (최소 ${MIN_LYRICS_LENGTH}자 이상)\n비워두면 자동으로 인스트루멘탈로 생성돼요\n\n[Verse] [Chorus] [Bridge] 태그로 구조를 지정할 수 있어요`}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              maxLength={LYRICS_MAX}
              disabled={isGenerating}
            />
            <div className="flex items-center justify-between py-1 min-h-[28px]">
              <button
                type="button"
                onClick={() => setLyricsModalOpen(true)}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-sm text-white bg-[#252A35] hover:bg-[#2C313D] px-4 py-1.5 rounded-full transition-colors disabled:opacity-40"
              >
                <Image src="/Ai-Generate-Text.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} />
                AI 가사
              </button>
              <div className="flex items-center gap-2">
                <CharCount length={lyrics.length} limit={LYRICS_MAX} />
                <button
                  type="button"
                  onClick={() => setLyricsFullscreen((v) => !v)}
                  disabled={isGenerating}
                  title={lyricsFullscreen ? '축소' : '전체 화면으로 편집'}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-[#252A35] hover:bg-[#2C313D] transition-colors disabled:opacity-40"
                >
                  <Image
                    src={lyricsFullscreen ? '/Fullscreen-Exit.svg' : '/Fullscreen.svg'}
                    alt={lyricsFullscreen ? '축소' : '전체 화면'}
                    width={16}
                    height={16}
                    style={{ filter: 'invert(1)' }}
                  />
                </button>
              </div>
            </div>
          </div>
          {!lyricsFullscreen && (
            <ResizeHandle onMouseDown={lyricsResize.onMouseDown} dragging={lyricsResize.dragging} />
          )}
        </div>
      </section>

      {/* 스타일 */}
      <section className={`rounded-xl border border-white/[0.08] bg-[#1A1D24] overflow-hidden group ${lyricsFullscreen ? 'hidden' : ''}`}>
        <div className="px-4 py-3 flex items-center gap-1">
          <span className="text-sm font-semibold text-white">스타일</span>
        </div>
        <div className="px-4 space-y-3">
          <textarea
            ref={styleRef}
            className="w-full bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-zinc-500 leading-relaxed"
            style={{ height: styleResize.height }}
            placeholder="장르, 분위기, 템포, 악기, 보컬 타입 등을 자유롭게 묘사하세요"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            maxLength={STYLE_MAX}
            disabled={isGenerating}
          />
          <div className="flex justify-end min-h-[20px]">
            <CharCount length={stylePrompt.length} limit={STYLE_MAX} />
          </div>
          {/* 퀵 태그 */}
          <div className="flex items-center gap-1.5 pb-3">
            <button
              type="button"
              onClick={reshuffleChips}
              disabled={isGenerating}
              title="다시 섞기"
              className="shrink-0 w-8 h-8 rounded-full bg-[#252A35] hover:bg-[#2C313D] flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <Image src="/Refresh.svg" alt="다시 섞기" width={16} height={16} style={{ filter: 'invert(1)' }} />
            </button>
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollChips('left')}
                className="shrink-0 w-8 h-8 rounded-full bg-[#252A35] hover:bg-[#2C313D] flex items-center justify-center transition-colors"
              >
                <Image src="/Left-Small.svg" alt="왼쪽" width={16} height={16} style={{ filter: 'invert(1)' }} />
              </button>
            )}
            <div className="relative flex-1 min-w-0">
              {canScrollLeft && (
                <div className="absolute left-0 inset-y-0 w-6 bg-gradient-to-r from-[#1A1D24] to-transparent pointer-events-none z-10" />
              )}
              <div
                ref={chipScrollRef}
                onScroll={handleChipScroll}
                className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => addChip(chip)}
                    disabled={isGenerating}
                    className="shrink-0 text-sm text-white bg-[#252A35] hover:bg-[#2C313D] px-4 py-1.5 rounded-full transition-colors disabled:opacity-40"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              {canScrollRight && (
                <div className="absolute right-0 inset-y-0 w-6 bg-gradient-to-l from-[#1A1D24] to-transparent pointer-events-none z-10" />
              )}
            </div>
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollChips('right')}
                className="shrink-0 w-8 h-8 rounded-full bg-[#252A35] hover:bg-[#2C313D] flex items-center justify-center transition-colors"
              >
                <Image src="/Right-Small.svg" alt="오른쪽" width={16} height={16} style={{ filter: 'invert(1)' }} />
              </button>
            )}
          </div>
        </div>
        <ResizeHandle onMouseDown={styleResize.onMouseDown} dragging={styleResize.dragging} />
      </section>

      {/* 곡 제목(선택) — 성별 위로 이동 */}
      <section className={`rounded-xl border border-white/[0.08] bg-[#1A1D24] ${lyricsFullscreen ? 'hidden' : ''}`}>
        <input
          type="text"
          className="w-full bg-transparent px-4 py-3.5 text-sm text-white focus:outline-none placeholder:text-zinc-500"
          placeholder="곡 제목(선택)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          disabled={isGenerating}
        />
      </section>

      {/* 보컬 성별 */}
      <section className={`rounded-xl border border-white/[0.08] bg-[#1A1D24] overflow-hidden ${lyricsFullscreen ? 'hidden' : ''}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">보컬 성별</span>
          <div className="flex gap-1.5">
            {(['female', 'male'] as const).map((v) => {
              const active = vocalGender === v
              return (
                <button
                  key={v}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setVocalGender(active ? null : v)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-colors disabled:opacity-40 ${
                    active
                      ? 'bg-violet-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  {v === 'female' ? '여성' : '남성'}
                </button>
              )
            })}
          </div>
        </div>
      </section>
      </div>
      )}

      {/* CTA — 하단 고정 (sticky + mt-auto). 심플·고급 모드 모두 viewport 하단에 정렬.
          위쪽 그라데이션 페이드로 스크롤 컨텐츠와 자연스러운 경계. */}
      <div className="mt-auto sticky bottom-0 z-10 -mx-6 px-6 pt-6 pb-6 bg-gradient-to-t from-[#111318] from-30% to-transparent">
        <button
          type="submit"
          disabled={!stylePrompt.trim() || isGenerating}
          className={`w-full rounded-xl py-4 font-semibold text-sm transition-colors ${
            isGenerating
              ? 'shimmer bg-violet-600 text-white cursor-not-allowed'
              : !stylePrompt.trim()
              ? 'bg-[#393C41] text-white'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <GeneratingPhrase elapsedSec={elapsed} />
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>음악 만들기</span>
              <span className="inline-flex items-center gap-1">
                <Image src="/Sparkles.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
                <span className="font-extrabold tabular-nums">{ctaCredits}</span>
              </span>
            </span>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-950/50 border border-red-900/50 rounded-xl p-3">{error}</p>
      )}

      {/* 스타일 참조 안내 팝업 */}
      {styleRefNotice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStyleRefNotice(false)} />
          <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl p-6 w-full max-w-[340px] shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-3">업로드 전 확인해주세요</h3>
            <p className="text-sm text-zinc-300 leading-relaxed mb-1">
              업로드하는 음원이 <span className="text-white font-medium">본인 소유</span>이거나{' '}
              <span className="text-white font-medium">사용 허가를 받은 음원</span>인지 확인해주세요.
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed mt-2">
              저작권이 있는 음원을 무단으로 업로드하면 법적 책임이 발생할 수 있습니다.
            </p>
            <label className="flex items-center gap-2 mt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={styleRefDontShow}
                onChange={(e) => setStyleRefDontShow(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-500"
              />
              <span className="text-sm text-zinc-400">다시 보지 않기</span>
            </label>
            <button
              type="button"
              onClick={() => {
                if (styleRefDontShow) localStorage.setItem('styleRefNoticeHidden', 'true')
                setStyleRefNotice(false)
                setStyleRefDontShow(false)
                refAudioInputRef.current?.click()
              }}
              className="mt-4 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
            >
              확인했어요
            </button>
          </div>
        </div>
      )}

      {/* 참조 음원 트림 모달 — 파일 선택 시 자동 오픈 */}
      {pendingRefFile && (
        <RefAudioTrimModal
          file={pendingRefFile}
          onClose={() => {
            setPendingRefFile(null)
            if (refAudioInputRef.current) refAudioInputRef.current.value = ''
          }}
          onSave={(blob, meta) => {
            // trimmed WAV Blob을 File로 래핑하여 refAudio로 저장
            const trimmedFile = new File([blob], meta.name.replace(/\.[^.]+$/, '') + '.wav', { type: 'audio/wav' })
            setRefAudio(trimmedFile)
            setRefMeta({ startSec: meta.startSec, endSec: meta.endSec })
            setPendingRefFile(null)
            if (refAudioInputRef.current) refAudioInputRef.current.value = ''
          }}
        />
      )}

      {/* AI 가사 생성 모달 */}
      <LyricsGenerateModal
        open={lyricsModalOpen}
        onClose={() => setLyricsModalOpen(false)}
        onGenerated={handleLyricsGenerated}
        initialPrompt={lyrics}
      />
    </form>
  )
}
