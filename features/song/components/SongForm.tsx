'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useSongGeneration } from '../hooks/useSongGeneration'

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

  return { height, dragging, onMouseDown }
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
  const [isDragOver, setIsDragOver] = useState(false)
  const [vocalGender, setVocalGender] = useState<'male' | 'female' | null>(null)
  const refAudioInputRef = useRef<HTMLInputElement>(null)
  const { status, elapsed, error, generate, reset } = useSongGeneration()
  const chipScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [chips, setChips] = useState<string[]>(ALL_CHIPS.slice(0, 16))
  const lyricsResize = useDragResize(144)
  const styleResize = useDragResize(96)

  const isGenerating = status === 'generating'

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
    setRefAudio(file)
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stylePrompt.trim() || isGenerating) return
    generate({
      prompt: stylePrompt.trim(),
      genre: '',
      mood: '',
      title,
      customLyrics: instrumental ? '' : lyrics,
      instrumental,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* 참고 음원 */}
      <input
        ref={refAudioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRefAudioFile(f) }}
      />
      <section
        onClick={() => !isGenerating && refAudioInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleRefDrop}
        className={`rounded-xl border bg-[#1E2129] overflow-hidden transition-colors ${
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
            <span className="text-sm font-semibold text-white">참고 음원</span>
            {refAudio ? (
              <p className="text-xs text-violet-400 mt-0.5 truncate">{refAudio.name}</p>
            ) : (
              <p className="text-xs text-zinc-400 mt-0.5">커버할 음원을 클릭하거나 드래그해서 추가하세요</p>
            )}
          </div>
          {refAudio && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setRefAudio(null); if (refAudioInputRef.current) refAudioInputRef.current.value = '' }}
              className="shrink-0 text-zinc-500 hover:text-white transition-colors p-1"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l10 10M11 1L1 11"/>
              </svg>
            </button>
          )}
        </div>
      </section>

      {/* 곡 제목 */}
      <section className="rounded-xl border border-white/[0.08] bg-[#1E2129] overflow-hidden">
        <input
          type="text"
          className="w-full bg-transparent px-4 py-3.5 text-sm text-white focus:outline-none placeholder:text-zinc-500"
          placeholder="곡 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          disabled={isGenerating}
        />
      </section>

      {/* 가사 */}
      <section className="rounded-xl border border-white/[0.08] bg-[#1E2129] overflow-hidden group">
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">가사</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-colors ${instrumental ? 'text-violet-400' : 'text-zinc-500'}`}>
              인스트루멘탈
            </span>
            <button
              type="button"
              onClick={() => { setInstrumental(!instrumental); if (!instrumental) setLyrics('') }}
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

        {/* 가사 입력 — 인스트루멘탈 시 접힘 */}
        <div
          className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
          style={{ maxHeight: instrumental ? 0 : lyricsResize.height + 56 }}
        >
          <div className="px-4">
            <textarea
              className="w-full bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-zinc-500 leading-relaxed"
              style={{ height: lyricsResize.height }}
              placeholder={`직접 가사를 입력하세요\n비워두면 AI가 자동으로 한국어 가사를 작성해요\n\n[Verse] [Chorus] [Bridge] 태그로 구조를 지정할 수 있어요`}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              maxLength={3500}
              disabled={isGenerating}
            />
            <div className="flex justify-end py-1">
              <span className="text-xs text-zinc-500">{lyrics.length} / 3,500</span>
            </div>
          </div>
          <ResizeHandle onMouseDown={lyricsResize.onMouseDown} dragging={lyricsResize.dragging} />
        </div>
      </section>

      {/* 스타일 */}
      <section className="rounded-xl border border-white/[0.08] bg-[#1E2129] overflow-hidden group">
        <div className="px-4 py-3 flex items-center gap-1">
          <span className="text-sm font-semibold text-white">스타일</span>
          <span className="text-red-400 text-xs">*</span>
        </div>
        <div className="px-4 space-y-3">
          <textarea
            className="w-full bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-zinc-500 leading-relaxed"
            style={{ height: styleResize.height }}
            placeholder="장르, 분위기, 템포, 악기, 보컬 타입 등을 자유롭게 묘사하세요"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            maxLength={2000}
            disabled={isGenerating}
          />
          <div className="flex justify-end">
            <span className="text-xs text-zinc-500">{stylePrompt.length} / 2,000</span>
          </div>
          {/* 퀵 태그 */}
          <div className="flex items-center gap-1.5 pb-3">
            <button
              type="button"
              onClick={reshuffleChips}
              disabled={isGenerating}
              title="다시 섞기"
              className="shrink-0 w-8 h-8 rounded-full bg-[#252A35] border border-white/[0.10] hover:border-white/40 flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <Image src="/Refresh.svg" alt="다시 섞기" width={16} height={16} style={{ filter: 'invert(1)' }} />
            </button>
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollChips('left')}
                className="shrink-0 w-8 h-8 rounded-full bg-[#252A35] border border-white/[0.10] hover:border-white/40 flex items-center justify-center transition-colors"
              >
                <Image src="/Left-Small.svg" alt="왼쪽" width={16} height={16} style={{ filter: 'invert(1)' }} />
              </button>
            )}
            <div className="relative flex-1 min-w-0">
              {canScrollLeft && (
                <div className="absolute left-0 inset-y-0 w-6 bg-gradient-to-r from-[#1E2129] to-transparent pointer-events-none z-10" />
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
                    className="shrink-0 text-sm text-white border border-white/[0.08] hover:border-white/20 px-4 py-1.5 rounded-full transition-colors disabled:opacity-40"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
              {canScrollRight && (
                <div className="absolute right-0 inset-y-0 w-6 bg-gradient-to-l from-[#1E2129] to-transparent pointer-events-none z-10" />
              )}
            </div>
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollChips('right')}
                className="shrink-0 w-8 h-8 rounded-full bg-[#252A35] border border-white/[0.10] hover:border-white/40 flex items-center justify-center transition-colors"
              >
                <Image src="/Right-Small.svg" alt="오른쪽" width={16} height={16} style={{ filter: 'invert(1)' }} />
              </button>
            )}
          </div>
        </div>
        <ResizeHandle onMouseDown={styleResize.onMouseDown} dragging={styleResize.dragging} />
      </section>

      {/* 보컬 성별 */}
      <section className="rounded-xl border border-white/[0.08] bg-[#1E2129] overflow-hidden">
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

      {/* 생성 버튼 */}
      <button
        type="submit"
        disabled={!stylePrompt.trim() || isGenerating}
        className={`w-full rounded-xl py-4 font-semibold text-sm transition-colors ${
          isGenerating
            ? 'shimmer bg-violet-600 text-white cursor-not-allowed'
            : !stylePrompt.trim()
            ? 'bg-[#393C41] text-zinc-500'
            : 'bg-violet-600 hover:bg-violet-500 text-white'
        }`}
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            생성 중… {elapsed}초
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a3.375 3.375 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a3.375 3.375 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clipRule="evenodd" />
            </svg>
            음악 만들기
          </span>
        )}
      </button>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-950/50 border border-red-900/50 rounded-xl p-3">{error}</p>
      )}
    </form>
  )
}
