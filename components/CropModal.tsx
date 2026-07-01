'use client'

// 업로드 시 위치 조정 모달 — react-easy-crop 기반
// 1:1 (곡 커버·아바타) 또는 wide banner 등 다양한 비율 지원
// 드래그 방향은 image vs container 비율에 따라 자동 결정 (overflow 방향)

import { useState, useCallback, useEffect } from 'react'
import Cropper, { Area } from 'react-easy-crop'

interface Props {
  open: boolean
  imageFile: File | null
  aspect: number              // 1, 1064/368 등
  outputMaxPx?: number        // 결과 이미지 최대 변 (기본 800)
  outputQuality?: number      // WebP quality (기본 0.85)
  title?: string
  mode?: 'crop' | 'focus'     // crop=파괴적 잘라내기(blob) / focus=초점만 반환(원본 보존)
  onCancel: () => void
  onConfirm?: (croppedBlob: Blob) => void
  onConfirmFocus?: (objectPosition: string) => void   // focus 모드에서 '50% 30%' 형태 반환
}

function clampPct(v: number) { return Math.max(0, Math.min(100, v)) }

async function getCroppedWebp(
  imageSrc: string,
  pixelCrop: Area,
  maxPx: number,
  quality: number,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = imageSrc
  })

  // 결과 사이즈: maxPx로 다운스케일 (가로/세로 중 큰 쪽 기준)
  const scale = Math.min(1, maxPx / Math.max(pixelCrop.width, pixelCrop.height))
  const outW = Math.round(pixelCrop.width * scale)
  const outH = Math.round(pixelCrop.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas ctx null')

  ctx.drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outW, outH,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
      'image/webp',
      quality,
    )
  })
}

export function CropModal({
  open,
  imageFile,
  aspect,
  outputMaxPx = 800,
  outputQuality = 0.85,
  title = '위치 조정',
  mode = 'crop',
  onCancel,
  onConfirm,
  onConfirmFocus,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixelArea, setPixelArea] = useState<Area | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [saving, setSaving] = useState(false)

  // imageFile → objectURL
  useEffect(() => {
    if (!imageFile) { setImageUrl(null); return }
    const url = URL.createObjectURL(imageFile)
    setImageUrl(url)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setPixelArea(null)
    setNatural(null)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setPixelArea(croppedAreaPixels)
  }, [])

  async function handleConfirm() {
    if (!imageUrl || !pixelArea || saving) return
    // focus 모드: 원본을 자르지 않고 object-position만 계산해 반환
    if (mode === 'focus' && onConfirmFocus) {
      const nw = natural?.w ?? 0, nh = natural?.h ?? 0
      const fx = nw - pixelArea.width > 0 ? clampPct((pixelArea.x / (nw - pixelArea.width)) * 100) : 50
      const fy = nh - pixelArea.height > 0 ? clampPct((pixelArea.y / (nh - pixelArea.height)) * 100) : 50
      onConfirmFocus(`${fx.toFixed(1)}% ${fy.toFixed(1)}%`)
      return
    }
    try {
      setSaving(true)
      const blob = await getCroppedWebp(imageUrl, pixelArea, outputMaxPx, outputQuality)
      onConfirm?.(blob)
    } catch (e) {
      console.error('[crop] failed:', e)
    } finally {
      setSaving(false)
    }
  }

  if (!open || !imageFile) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-[440px] bg-[#181B22] border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden">
        {/* 닫기 */}
        <button
          onClick={onCancel}
          aria-label="취소"
          className="absolute top-3.5 right-3.5 z-20 w-7 h-7 rounded-full bg-black/60 hover:bg-white flex items-center justify-center text-white hover:text-zinc-900 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </button>

        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-xs text-zinc-400 mt-1">드래그해서 표시할 영역을 조절하세요</p>
        </div>

        {/* Cropper 영역 */}
        <div className="relative w-full bg-black" style={{ aspectRatio: aspect }}>
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              minZoom={mode === 'focus' ? 1 : undefined}
              maxZoom={mode === 'focus' ? 1 : undefined}
              onCropChange={setCrop}
              onZoomChange={mode === 'focus' ? () => {} : setZoom}
              onCropComplete={onCropComplete}
              onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
              showGrid={false}
              objectFit="contain"
              restrictPosition={true}
              style={{
                containerStyle: { background: '#000' },
                cropAreaStyle: { border: '2px solid rgba(255,255,255,0.6)', color: 'rgba(0,0,0,0.6)' },
              }}
            />
          )}
        </div>

        {/* 액션 */}
        <div className="flex gap-2 p-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-zinc-200 text-sm font-medium transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!pixelArea || saving}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  )
}
