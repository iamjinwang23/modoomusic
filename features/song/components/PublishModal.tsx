'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { songService } from '@/services/song.service'
import { useAuth } from '@/components/AuthProvider'
import { toast } from '@/components/toast/toast'
import type { Song } from '@/types/domain'

interface Props {
  song: Song
  onClose: () => void
}

export function PublishModal({ song, onClose }: Props) {
  const { user, profile } = useAuth()
  const hue = song.coverHue ?? (song.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 137) % 360
  const h2 = (hue + 55) % 360
  const defaultGradient = `linear-gradient(160deg, hsl(${hue},70%,50%) 0%, hsl(${h2},60%,35%) 60%, hsl(${(h2 + 40) % 360},50%,24%) 100%)`

  const [coverPreview, setCoverPreview] = useState<string | null>(song.publishCoverImage ?? song.coverImage ?? null)
  const [comment, setComment] = useState(song.publishComment ?? '')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => setCoverPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) handleFile(file)
  }

  function handlePublish() {
    songService.update(song.id, {
      published: true,
      publishedAt: new Date().toISOString(),
      publishComment: comment.trim() || undefined,
      publishCoverImage: coverPreview ?? undefined,
    })
    window.dispatchEvent(new CustomEvent('song-updated'))
    toast.success('곡이 게시되었어요')
    onClose()
    if (user) {
      const username = profile?.username ?? user.user_metadata?.username ?? user.email?.split('@')[0] ?? user.id.slice(0, 8)
      setTimeout(() => window.dispatchEvent(new CustomEvent('view-profile', { detail: username })), 0)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.08] rounded-2xl w-full max-w-[520px] p-5 shadow-2xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-xl font-semibold text-white">게시하기</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        {/* 2열 레이아웃 */}
        <div className="flex gap-4 mb-4">
          {/* 좌: 커버 */}
          <div className="shrink-0 w-[160px]">
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer group"
              style={coverPreview ? undefined : { background: defaultGradient }}
            >
              {coverPreview && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                <Image src="/Photo-Album.svg" alt="" width={24} height={24} style={{ filter: 'invert(1)' }} />
                <span className="text-xs text-white/80">커버 변경</span>
              </div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          {/* 우: 타이틀 + 코멘트 + 태그 */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* 타이틀 + 인스트루멘탈 뱃지 */}
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-base font-semibold text-white truncate">{song.title || 'Untitled'}</p>
              {song.instrumental && (
                <span className="shrink-0 text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-white/[0.06] leading-none">Instrumental</span>
              )}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="이 음악에 대한 코멘트를 남겨보세요 (선택)"
              className="flex-1 w-full bg-white/[0.06] text-sm text-white px-3 py-2.5 rounded-xl outline-none placeholder:text-zinc-500 focus:ring-1 focus:ring-violet-500 resize-none leading-relaxed min-h-0"
            />
            {/* 태그 */}
            <div className="flex flex-wrap gap-1.5">
              {song.genre && (
                <span className="text-xs text-zinc-300 bg-white/[0.08] px-2.5 py-1 rounded-full border border-white/[0.06]">{song.genre}</span>
              )}
              {song.mood && (
                <span className="text-xs text-zinc-300 bg-white/[0.08] px-2.5 py-1 rounded-full border border-white/[0.06]">{song.mood}</span>
              )}
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/[0.10] text-zinc-400 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            취소
          </button>
          <button
            onClick={handlePublish}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            {song.published ? '재게시' : '게시하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
