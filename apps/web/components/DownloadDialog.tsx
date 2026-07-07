'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { ID3Writer } from 'browser-id3-writer'
import { toast } from '@/components/toast/toast'

// 다운로드 안내 다이얼로그 — Suno 패턴 참고.
// 현재(Free Only): 본인 곡만 다운로드 가능, 매번 안내 표시.
// 추후 유료 티어 생기면 유료 사용자에게만 다이얼로그 건너뛰기 옵션 추가.
// ID3v2 태그(제목·아티스트·앨범·커버)를 mp3에 주입 — macOS Finder·QuickLook·뮤직 플레이어에서 메타 표시.

interface Props {
  open: boolean
  onClose: () => void
  audioUrl: string
  title: string
  artist?: string         // 아티스트 표시명 (보통 곡 소유자의 displayName)
  coverUrl?: string       // APIC 프레임에 들어갈 커버 이미지 URL
}

// WebP·JPG·PNG 등 어떤 포맷이든 canvas로 JPEG 재인코딩 → ID3 APIC 호환성 최대화.
async function coverToJpegArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    // 너무 큰 이미지는 1000px 이하로 축소 (음악 플레이어 표시엔 충분, 파일 크기 절감)
    const maxSide = 1000
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, w, h)
    const jpegBlob: Blob | null = await new Promise((r) => canvas.toBlob((b) => r(b), 'image/jpeg', 0.9))
    if (!jpegBlob) return null
    return await jpegBlob.arrayBuffer()
  } catch (e) {
    console.warn('[download] cover convert failed:', e)
    return null
  }
}

export function DownloadDialog({ open, onClose, audioUrl, title, artist, coverUrl }: Props) {
  const [visible, setVisible] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [open])

  function handleClose() {
    if (downloading) return
    setVisible(false)
    setTimeout(onClose, 280)
  }

  // fetch → ID3 태그 주입 → blob → download.
  // 커버 fetch는 병렬, 실패해도 mp3만으로 진행 (커버 없는 곡 대비).
  async function handleDownload() {
    if (!audioUrl || downloading) return
    setDownloading(true)
    try {
      const [mp3Res, coverJpeg] = await Promise.all([
        fetch(audioUrl),
        coverUrl ? coverToJpegArrayBuffer(coverUrl) : Promise.resolve(null),
      ])
      if (!mp3Res.ok) throw new Error(`mp3 fetch ${mp3Res.status}`)
      const mp3Buf = await mp3Res.arrayBuffer()

      const writer = new ID3Writer(mp3Buf)
      writer.setFrame('TIT2', title || '제목 없음')
            .setFrame('TPE1', [artist || 'MONO'])
            .setFrame('TALB', 'MONO (모두의 노래)')
      if (coverJpeg) {
        writer.setFrame('APIC', { type: 3, data: coverJpeg, description: 'Cover' })
      }
      writer.addTag()
      const taggedBlob = writer.getBlob()

      const url = URL.createObjectURL(taggedBlob)
      const safeTitle = (title || '제목 없음').replace(/[\\/:*?"<>|]/g, '_').trim()
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeTitle}.mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('다운로드를 시작했어요')
      handleClose()
    } catch (e) {
      console.error('[download]', e)
      toast.error('다운로드에 실패했어요')
      setDownloading(false)
    }
  }

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-280 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className="relative bg-[#21252E] border border-white/[0.10] rounded-t-2xl md:rounded-2xl w-full max-w-full md:max-w-[400px] max-h-[90vh] overflow-y-auto p-6 shadow-2xl transition-all duration-280 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* 닫기 */}
        <button
          onClick={handleClose}
          aria-label="닫기"
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors"
        >
          <Image src="/Close-Fill.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
        </button>

        {/* 아이콘 + 제목 */}
        <div className="flex flex-col items-center text-center mb-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-violet-600/15 flex items-center justify-center mb-3">
            <Image src="/Arrow-To-Down.svg" alt="" width={22} height={22} style={{ filter: 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)' }} />
          </div>
          <p className="text-lg font-semibold text-white">다운로드 안내</p>
        </div>

        {/* 본문 — 약관 제7조(콘텐츠의 권리) + MiniMax ToS(딥신스 표기 의무) 기반 */}
        <div className="text-sm text-zinc-300 leading-relaxed space-y-2.5 mb-5">
          <p>
            이 곡의 저작권은 <span className="text-white font-medium">회원님에게 귀속</span>되며, <span className="text-white font-medium">개인 사용 목적</span>으로 자유롭게 다운로드할 수 있어요.
          </p>
          <ul className="text-zinc-400 text-xs leading-relaxed space-y-1.5 list-disc marker:text-zinc-600 bg-white/[0.03] rounded-xl pl-9 pr-6 py-3.5">
            <li><span className="text-amber-300/90">외부 플랫폼 업로드 시 'AI로 만든 곡' 표기가 필요해요</span> (YouTube·TikTok·인스타 등 — AI 생성물 공개 표기 의무)</li>
            <li>상업적 이용은 향후 유료 플랜에서 지원 예정 (현재는 개인·비상업적 사용)</li>
            <li>참조 음원으로 만든 곡이라면 해당 음원의 권리 보유·사용 허가는 회원님 책임이에요</li>
            <li>타인의 저작권·초상권·상표권을 침해하는 방식으로 사용하지 말아주세요</li>
          </ul>
          <p className="text-zinc-500 text-[11px] pt-1 leading-relaxed">
            자세한 내용은{' '}
            <a href="/terms" target="_blank" rel="noopener" className="text-violet-400 hover:text-violet-300 underline">
              이용약관 제7조 (콘텐츠의 권리)
            </a>
            와 기반 AI 모델 제공자({' '}
            <a href="https://platform.minimax.io/protocol/terms-of-service" target="_blank" rel="noopener" className="text-violet-400 hover:text-violet-300 underline">
              MiniMax ToS
            </a>
            ) 정책을 함께 따릅니다.
          </p>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || !audioUrl}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {downloading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              다운로드 중…
            </>
          ) : (
            <>
              <Image src="/Arrow-To-Down.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
              MP3 다운로드
            </>
          )}
        </button>
      </div>
    </div>,
    document.body,
  )
}
