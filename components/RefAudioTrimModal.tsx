// 참조 음원 트림 모달 — MiniMax cover reference audio (6초~6분 정책)
// 파형 + 두 손잡이 슬라이더(start/end) + 미리듣기 + Save (trimmed WAV Blob 반환)
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import {
  decodeAudioFile,
  trimBuffer,
  bufferToWav,
  computeWaveformPeaks,
  type DecodedAudio,
} from '@/utils/audioTrim'

interface Props {
  file: File
  onClose: () => void
  // 사용자가 Save 누르면 트림된 WAV Blob + 원본 파일 메타 전달
  onSave: (trimmed: Blob, meta: { name: string; startSec: number; endSec: number }) => void
}

const MIN_DURATION_SEC = 6
const MAX_DURATION_SEC = 30  // 너무 길면 cover 의미 약함 — 6~30초 권장
const BAR_COUNT = 120

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec - Math.floor(sec)) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(ms).padStart(2, '0')}`
}

export function RefAudioTrimModal({ file, onClose, onSave }: Props) {
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(0)
  const [currentSec, setCurrentSec] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [saving, setSaving] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const waveBoxRef = useRef<HTMLDivElement | null>(null)

  // 파일 로드
  useEffect(() => {
    let cancelled = false
    decodeAudioFile(file).then((d) => {
      if (cancelled) return
      setDecoded(d)
      setPeaks(computeWaveformPeaks(d.buffer, BAR_COUNT))
      // 초기 트림: 처음 6초 (또는 전체가 짧으면 전체)
      const total = d.durationSec
      setStartSec(0)
      setEndSec(Math.min(MIN_DURATION_SEC, total))
    }).catch((err) => {
      console.error('[RefAudioTrimModal] decode failed', err)
      if (!cancelled) onClose()
    })

    // HTMLAudioElement (미리듣기)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => setPlaying(false)
    audio.ontimeupdate = () => {
      const t = audio.currentTime
      setCurrentSec(t)
      // 끝 도달 시 자동 정지
      if (t >= endSecRef.current - 0.05) { audio.pause(); setPlaying(false) }
    }
    return () => {
      cancelled = true
      audio.pause()
      audio.src = ''
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // start/end 최신값 ref (audio ontimeupdate + 드래그 up handler 안에서 stale 회피)
  const startSecRef = useRef(startSec)
  const endSecRef = useRef(endSec)
  useEffect(() => { startSecRef.current = startSec }, [startSec])
  useEffect(() => { endSecRef.current = endSec }, [endSec])

  // 드래그 끝났을 때 startSec부터 미리듣기 자동 재생
  const playFromStart = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = startSecRef.current
    a.play().catch(() => {})
    setPlaying(true)
  }, [])

  const togglePlay = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else {
      // 현재 위치가 구간 밖이면 start로
      if (a.currentTime < startSec || a.currentTime >= endSec) a.currentTime = startSec
      a.play().catch(() => {})
      setPlaying(true)
    }
  }, [playing, startSec, endSec])

  const reset = useCallback(() => {
    if (!decoded) return
    setStartSec(0)
    setEndSec(Math.min(MIN_DURATION_SEC, decoded.durationSec))
    const a = audioRef.current
    if (a) { a.pause(); a.currentTime = 0 }
    setPlaying(false)
    setCurrentSec(0)
  }, [decoded])

  async function handleSave() {
    if (!decoded || saving) return
    setSaving(true)
    try {
      const trimmedBuf = trimBuffer(decoded.buffer, startSec, endSec)
      const wavBlob = bufferToWav(trimmedBuf)
      onSave(wavBlob, { name: file.name, startSec, endSec })
    } catch (err) {
      console.error('[RefAudioTrimModal] save failed', err)
    } finally {
      setSaving(false)
    }
  }

  // 파형 위 드래그 핸들 (start/end). 최소 6초·최대 30초 유지
  function applyStart(v: number) {
    if (!decoded) return
    const max = Math.min(decoded.durationSec, endSec - MIN_DURATION_SEC)
    const min = Math.max(0, endSec - MAX_DURATION_SEC)
    setStartSec(Math.max(min, Math.min(max, v)))
  }
  function applyEnd(v: number) {
    if (!decoded) return
    const min = startSec + MIN_DURATION_SEC
    const max = Math.min(decoded.durationSec, startSec + MAX_DURATION_SEC)
    setEndSec(Math.min(max, Math.max(min, v)))
  }

  function onHandleDown(which: 'start' | 'end') {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const box = waveBoxRef.current
      if (!box || !decoded) return
      const rect = box.getBoundingClientRect()
      const move = (ev: PointerEvent) => {
        const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left))
        const sec = (x / rect.width) * decoded.durationSec
        if (which === 'start') applyStart(sec)
        else applyEnd(sec)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        playFromStart()  // 드래그 끝 → 새 startSec부터 자동 재생
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
  }

  // 선택 영역 박스 내부 드래그 — 통째로 평행 이동 (start/end 동시)
  function onBoxDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const box = waveBoxRef.current
    if (!box || !decoded) return
    const rect = box.getBoundingClientRect()
    const initStartX = e.clientX
    const initStart = startSec
    const width = endSec - startSec
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - initStartX
      const dSec = (dx / rect.width) * decoded.durationSec
      const newStart = Math.max(0, Math.min(decoded.durationSec - width, initStart + dSec))
      setStartSec(newStart)
      setEndSec(newStart + width)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      playFromStart()  // 드래그 끝 → 새 startSec부터 자동 재생
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const duration = decoded?.durationSec ?? 0
  const trimmedSec = endSec - startSec
  const canSave = !!decoded && trimmedSec >= MIN_DURATION_SEC && trimmedSec <= MAX_DURATION_SEC

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#181B22] border border-white/[0.10] rounded-2xl shadow-2xl w-full max-w-[680px] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <p className="text-sm font-semibold text-white truncate flex-1 pr-4">{file.name}</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11"/>
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5">
          {!decoded ? (
            <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">불러오는 중…</div>
          ) : (
            <>
              {/* 시간 + 미리듣기 */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-full bg-white hover:bg-zinc-100 flex items-center justify-center transition-colors"
                >
                  <Image
                    src={playing ? '/Pause.svg' : '/Play.svg'}
                    alt={playing ? '일시정지' : '재생'}
                    width={16}
                    height={16}
                  />
                </button>
                <p className="text-xs text-zinc-400 tabular-nums">
                  {formatTime(currentSec)} / {formatTime(duration)}
                </p>
              </div>

              {/* 파형 + 드래그 핸들 영역 */}
              <div ref={waveBoxRef} className="relative h-28 bg-[#0f1218] rounded-lg overflow-hidden mb-3 select-none touch-none">
                {/* 파형 bars */}
                <div className="absolute inset-x-2 inset-y-2 flex items-center gap-[2px] pointer-events-none">
                  {peaks.map((p, i) => {
                    const barCenterRatio = (i + 0.5) / BAR_COUNT
                    const sec = barCenterRatio * duration
                    const inRange = sec >= startSec && sec <= endSec
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${inRange ? 'bg-violet-400' : 'bg-zinc-700'}`}
                        style={{ height: `${Math.max(8, p * 100)}%` }}
                      />
                    )
                  })}
                </div>
                {/* 트림 영역 박스 — 내부 드래그로 통째 평행 이동 */}
                {duration > 0 && (
                  <div
                    onPointerDown={onBoxDown}
                    className="absolute inset-y-1 border-2 border-white/80 rounded-md cursor-grab active:cursor-grabbing"
                    style={{
                      left: `${(startSec / duration) * 100}%`,
                      width: `${((endSec - startSec) / duration) * 100}%`,
                    }}
                  />
                )}
                {/* 시작 핸들 — hit area 넓게 (w-6), 시각 막대 얇게 */}
                {duration > 0 && (
                  <div
                    onPointerDown={onHandleDown('start')}
                    className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize z-20 flex items-center justify-center"
                    style={{ left: `${(startSec / duration) * 100}%` }}
                  >
                    <div className="h-[80%] w-1.5 rounded-full bg-white shadow-md" />
                  </div>
                )}
                {/* 끝 핸들 */}
                {duration > 0 && (
                  <div
                    onPointerDown={onHandleDown('end')}
                    className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize z-20 flex items-center justify-center"
                    style={{ left: `${(endSec / duration) * 100}%` }}
                  >
                    <div className="h-[80%] w-1.5 rounded-full bg-white shadow-md" />
                  </div>
                )}
                {/* 재생 헤드 */}
                {playing && (
                  <div
                    className="absolute inset-y-1 w-0.5 bg-white/70 pointer-events-none"
                    style={{ left: `${(currentSec / duration) * 100}%` }}
                  />
                )}
              </div>

              {/* 시작·끝 시간 라벨 */}
              <div className="flex items-center justify-between text-xs text-zinc-400 tabular-nums px-1 mb-3">
                <span>{formatTime(startSec)}</span>
                <span className="text-zinc-500">선택 {trimmedSec.toFixed(1)}초</span>
                <span>{formatTime(endSec)}</span>
              </div>

              {/* 안내 + 액션 */}
              <div className="flex items-center justify-between mt-5">
                <p className="text-xs text-zinc-500">
                  {trimmedSec < MIN_DURATION_SEC
                    ? `최소 6초 이상 (현재 ${trimmedSec.toFixed(1)}초)`
                    : trimmedSec > MAX_DURATION_SEC
                      ? `최대 30초까지 (현재 ${trimmedSec.toFixed(1)}초)`
                      : '핸들을 드래그해서 구간을 선택하세요'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={reset}
                    className="px-4 py-2 rounded-full text-sm text-zinc-400 hover:text-white border border-white/[0.10] hover:border-white/20 transition-colors"
                  >
                    초기화
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                      canSave && !saving
                        ? 'bg-white text-black hover:bg-zinc-100'
                        : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    {saving ? '처리 중…' : '저장'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
