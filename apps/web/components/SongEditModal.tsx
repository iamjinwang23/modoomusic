'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { toast } from '@/components/toast/toast'
import { uploadSongCover } from '@/utils/imageUpload'
import { CropModal } from '@/components/CropModal'
import { useAuth } from '@/components/AuthProvider'
import type { Song } from '@mono/shared'

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
  const [comment, setComment] = useState(song.publishComment ?? '')
  const [lyrics, setLyrics] = useState(song.lyrics ?? '')
  // 'main' = 제목·커버·코멘트, 'lyrics' = 가사 편집 서브 화면 (뒤로가기로 main 복귀)
  const [view, setView] = useState<'main' | 'lyrics'>('main')
  const [hue, setHue] = useState(song.coverHue ?? baseHue(song.id))
  const [coverImage, setCoverImage] = useState<string | null>(song.coverImage ?? null)
  const [pendingFile, setPendingFile] = useState<File | Blob | null>(null)  // 저장 시점에 업로드 (crop된 Blob 또는 File)
  const [cropFile, setCropFile] = useState<File | null>(null)
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
      publishComment: comment.trim() || undefined,
      lyrics: lyrics.trim() || null,
    })
    window.dispatchEvent(new CustomEvent('song-updated'))
    toast.success('곡 정보가 저장되었어요')
    handleClose()
  }

  function handleFile(file: File) {
    // CropModal에 위임 — 위치 조정 후 confirm
    setCropFile(file)
    setShowPicker(false)
  }

  function handleCropConfirm(blob: Blob) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const objectUrl = URL.createObjectURL(blob)
    setPreviewUrl(objectUrl)
    setCoverImage(objectUrl)
    setPendingFile(blob)
    setCropFile(null)
  }

  if (typeof document === 'undefined') return null

  // Portal로 body에 렌더링 — SongDetailPage가 모바일에서 fixed z-[55] isolate로
  // 자체 stacking context를 만들고 미니바 영역(148px)을 비워둔 채 그 안에 모달이
  // 갇혀 미니바 아래로 들어가는 문제 해결.
  return createPortal(
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
        {/* 헤더 — main: 닫기 / lyrics: 뒤로가기 + 타이틀 */}
        <div className="flex items-center justify-between mb-5">
          {view === 'main' ? (
            <>
              <p className="text-xl font-semibold text-white">곡 정보 수정</p>
              <button onClick={handleClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setView('main')}
                className="flex items-center gap-2 text-white hover:text-zinc-300 transition-colors"
                aria-label="뒤로 가기"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <span className="text-xl font-semibold">가사 수정</span>
              </button>
              <button onClick={handleClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
              </button>
            </>
          )}
        </div>

        {view === 'lyrics' ? (
          /* 가사 편집 서브 화면 — 텍스트영역 + 뒤로가기/저장 */
          <>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="가사를 자유롭게 수정하세요. [Verse] [Chorus] [Bridge] 같은 구조 태그도 사용할 수 있어요."
              className="w-full h-[480px] max-h-[60vh] bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors resize-none leading-relaxed mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView('main')}
                className="flex-1 py-3.5 rounded-xl border border-white/[0.10] text-zinc-400 hover:text-white hover:border-white/20 text-sm transition-colors"
              >
                뒤로
              </button>
              <button
                type="button"
                onClick={() => setView('main')}
                className="flex-1 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
              >
                확인
              </button>
            </div>
          </>
        ) : (
        <>
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

          {/* 우: 제목 + 코멘트 + 가사 편집 — 커버 우측에 세로로 정렬 */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* 제목 */}
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
            </div>

            {/* 코멘트 */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">코멘트</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="이 곡에 대한 짧은 한마디나 소개"
                rows={4}
                maxLength={300}
                className="w-full bg-white/[0.06] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* 가사 편집 메뉴 — 클릭 시 서브 화면 */}
            <button
              type="button"
              onClick={() => setView('lyrics')}
              className="w-full flex items-center justify-between bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl px-3 py-2.5 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm text-white">
                <Image src="/Ai-Generate-Text.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
                가사 수정
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-3.5 rounded-xl border border-white/[0.10] text-zinc-400 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            저장
          </button>
        </div>
        </>
        )}
      </div>

      {/* 업로드 시 위치 조정 — 카드·곡 상세 표시 기준 2:3 세로 */}
      <CropModal
        open={!!cropFile}
        imageFile={cropFile}
        aspect={2 / 3}
        title="커버 위치 조정"
        onCancel={() => setCropFile(null)}
        onConfirm={handleCropConfirm}
      />
    </div>,
    document.body,
  )
}
