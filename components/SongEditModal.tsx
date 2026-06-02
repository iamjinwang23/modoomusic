'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { toast } from '@/components/toast/toast'
import { uploadSongCover } from '@/utils/imageUpload'
import { useAuth } from '@/components/AuthProvider'
import type { Song } from '@/types/domain'

const COVER_HUES = [0, 30, 60, 120, 180, 210, 260, 300]

function baseHue(id: string) {
  return (id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
}

function previewGradient(hue: number) {
  const h2 = (hue + 55) % 360
  return `linear-gradient(135deg, hsl(${hue},65%,48%) 0%, hsl(${h2},55%,32%) 100%)`
}

interface Props {
  song: Song
  onClose: () => void
}

export function SongEditModal({ song, onClose }: Props) {
  const { user } = useAuth()
  const songId = useRef(song.id)  // 모달 오픈 시점 ID 고정 — 재생 중 곡 변경돼도 영향 없음
  const [title, setTitle] = useState(song.title ?? '')
  const [hue, setHue] = useState(song.coverHue ?? baseHue(song.id))
  const [coverImage, setCoverImage] = useState<string | null>(song.coverImage ?? null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)  // 저장 시점에 업로드 트랜잭션
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)  // objectURL — 즉시 프리뷰
  const [showPicker, setShowPicker] = useState(false)
  const [visible, setVisible] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 모달 종료 시 objectURL 정리
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  async function handleSave() {
    if (uploading) return
    let finalCoverImage = coverImage
    // 저장 시점에 Storage 업로드 — 파일 새로 선택했을 때만
    if (pendingFile && user) {
      setUploading(true)
      const url = await uploadSongCover(user.id, songId.current, pendingFile, 'cover')
      setUploading(false)
      if (!url) { toast.error('커버 이미지 업로드 실패'); return }
      finalCoverImage = url
    }
    songService.update(songId.current, {
      title: title.trim() || null,
      coverHue: hue,
      coverImage: finalCoverImage ?? undefined,
    })
    window.dispatchEvent(new CustomEvent('song-updated'))
    toast.success('곡 정보가 저장되었어요')
    handleClose()
  }

  function handleFile(file: File) {
    // 즉시 프리뷰만 — 실제 업로드는 저장 시점
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    setCoverImage(objectUrl)
    setPendingFile(file)
    setShowPicker(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-280 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className="relative bg-[#21252E] border border-white/[0.10] rounded-t-2xl md:rounded-2xl w-full max-w-full md:max-w-[520px] max-h-[90vh] overflow-y-auto p-5 shadow-2xl transition-all duration-280 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-xl font-semibold text-white">곡 정보 편집</p>
          <button onClick={handleClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        {/* 2열 레이아웃 */}
        <div className="flex gap-4 mb-4">
          {/* 좌: 커버 */}
          <div className="shrink-0 w-[120px]">
            <div
              onClick={() => setShowPicker((v) => !v)}
              className="relative w-full aspect-[2/3] rounded-xl overflow-hidden cursor-pointer group"
              style={coverImage ? undefined : { background: previewGradient(hue) }}
            >
              {coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImage} alt="" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                <Image src="/Photo-Album.svg" alt="" width={22} height={22} style={{ filter: 'invert(1)' }} />
                <span className="text-xs text-white/80">커버 변경</span>
              </div>
            </div>

            {/* 색상 + 이미지 피커 */}
            {showPicker && (
              <div className="mt-3 space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full text-xs text-zinc-400 hover:text-white border border-white/[0.12] hover:border-white/30 rounded-lg px-2 py-1.5 transition-colors"
                >
                  이미지 첨부
                </button>
                <div className="flex flex-wrap gap-2">
                  {COVER_HUES.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => { setHue(h); setCoverImage(null); setPendingFile(null); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) } setShowPicker(false) }}
                      className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                        !coverImage && hue === h ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#21252E]' : ''
                      }`}
                      style={{ background: previewGradient(h) }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 우: 제목 입력 */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목 없음"
                maxLength={100}
                autoFocus
                className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors"
              />
              <p className={`text-xs text-right tabular-nums ${title.length >= 100 ? 'text-red-400' : 'text-zinc-600'}`}>
                {title.length}/100
              </p>
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-2.5 rounded-xl border border-white/[0.10] text-zinc-400 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
