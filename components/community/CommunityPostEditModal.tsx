'use client'
// 커뮤니티 글 수정 모달 — 배경 잠금(Portal). 첨부가 있던 글은 텍스트만 수정,
// 텍스트만 있던 글은 음악·이미지·임베드·투표 중 하나를 추가할 수 있음.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import { songService } from '@/services/song.service'
import { PostImageGallery } from '@/components/community/PostImageGallery'
import { PostEmbed } from '@/components/community/PostEmbed'
import { PollCard } from '@/components/community/PollCard'
import { SongEmbedCard } from '@/components/community/SongEmbedCard'
import type { CommunityPost } from '@/types/domain'

function SongCover({ coverImage, coverHue, size = 40 }: { coverImage?: string | null; coverHue?: number | null; size?: number }) {
  const c = profileColor(coverHue ?? 0)
  return (
    <div className="rounded-md overflow-hidden shrink-0" style={{ width: size, height: size, background: `linear-gradient(135deg, ${c.bg}, #161922)` }}>
      {coverImage && <img src={coverImage} alt="" className="w-full h-full object-cover" />}
    </div>
  )
}

// 본문 첫 URL (임베드 미리보기용)
function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : null
}

export function CommunityPostEditModal({ post, communityId, onClose, onSaved }: {
  post: CommunityPost
  communityId: string
  onClose: () => void
  onSaved: (patch: Partial<CommunityPost>) => void
}) {
  const [content, setContent] = useState(post.content)
  const [images, setImages] = useState<string[]>(post.imageUrls ?? [])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [song, setSong] = useState<CommunityPost['song']>(post.song ?? null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[] | null>(post.poll ? [...post.poll.options] : null)
  const [saving, setSaving] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  // 내용에 맞춰 높이 자동 조절 (최소 60px, 최대 240px)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 60), 240)}px`
  }, [content])

  // 원글에 첨부가 있으면 텍스트만 수정 (첨부 편집 불가). 레거시 단수 imageUrl도 첨부로 간주.
  const hadAttachment = !!post.song || (post.imageUrls?.length ?? 0) > 0 || !!post.imageUrl || !!post.linkUrl || !!post.poll
  const hasAttachment = !!song || images.length > 0 || !!pollOptions

  async function handleImageFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = 10 - images.length
    if (remaining <= 0) { toast.error('이미지는 최대 10장까지 첨부할 수 있어요'); return }
    const picked = Array.from(files).slice(0, remaining)
    setUploadingImages(true)
    const fd = new FormData()
    picked.forEach((f) => fd.append('files', f))
    const res = await fetch(`/api/communities/${communityId}/post-images`, { method: 'POST', body: fd })
    setUploadingImages(false)
    if (!res.ok) { toast.error('이미지 업로드에 실패했어요'); return }
    const j = await res.json()
    setImages((prev) => [...prev, ...(j.urls ?? [])].slice(0, 10))
  }

  async function handleSave() {
    const text = content.trim()
    const pollOpts = pollOptions ? pollOptions.map(o => o.trim()).filter(Boolean) : null
    const hasMedia = song || images.length > 0 || (pollOpts && pollOpts.length >= 2)
    if (saving) return
    if (!text && !hasMedia) { toast.info('내용을 입력하거나 첨부를 추가해주세요'); return }
    setSaving(true)
    const body = hadAttachment
      ? { content: text }
      : { content: text, imageUrls: images, songId: song?.id ?? null, pollOptions: pollOpts }
    const res = await fetch(`/api/community-posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) { toast.error('수정에 실패했어요'); return }
    const j = await res.json().catch(() => ({}))
    onSaved(hadAttachment ? { content: j.post?.content ?? text } : {
      content: j.post?.content ?? text,
      imageUrls: j.post?.imageUrls ?? images,
      song: j.post?.song ?? song,
      poll: j.post?.poll ?? (pollOpts && pollOpts.length >= 2 ? { options: pollOpts, endsAt: post.poll?.endsAt ?? new Date(Date.now() + 86400000).toISOString(), counts: pollOpts.map(() => 0), totalVotes: 0, myVote: null } : null),
    })
    onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full h-full md:h-auto md:max-w-[520px] md:max-h-[85vh] md:mx-4 bg-[#181B22] md:border border-white/[0.10] rounded-none md:rounded-2xl shadow-2xl flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">글 수정</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          <textarea ref={contentRef} value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} autoFocus placeholder="내용을 입력하세요"
            className="w-full bg-transparent border-0 p-0 text-sm text-zinc-200 leading-relaxed placeholder:text-zinc-600 focus:outline-none resize-none overflow-y-auto" />

          {/* 첨부가 있던 글: 원글 형태 그대로 미리보기(읽기 전용). 첨부는 수정 불가, 본문만 편집. */}
          {hadAttachment && (
            <div className="pointer-events-none opacity-90 space-y-2">
              {post.imageUrls && post.imageUrls.length > 0 && <PostImageGallery images={post.imageUrls} />}
              {(() => { const url = post.linkUrl || firstUrl(content); return url ? <PostEmbed url={url} /> : null })()}
              {post.poll && <PollCard poll={post.poll} postId={post.id} gate={() => false} />}
              {post.song && <SongEmbedCard song={post.song} artist={post.authorName} ownerUserId={post.authorId} ownerAvatarUrl={post.authorAvatarUrl} ownerAvatarHue={post.authorAvatarHue} currentUserId={null} />}
            </div>
          )}

          {/* 텍스트만 있던 글: 첨부 하나 추가 가능 */}
          {!hadAttachment && (
            <>
              {song && (
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <SongCover coverImage={song.coverImage} coverHue={song.coverHue} size={32} />
                  <span className="text-sm text-white truncate flex-1">{song.title || '제목 없음'}</span>
                  <button onClick={() => setSong(null)} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition active:scale-90">
                    <Image src="/Close-Fill.svg" alt="제거" width={12} height={12} style={{ filter: 'invert(0.5)' }} />
                  </button>
                </div>
              )}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((url, i) => (
                    <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/[0.08]">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center">
                        <Image src="/Close-Fill.svg" alt="제거" width={10} height={10} style={{ filter: 'invert(1)' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {pollOptions && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">투표 옵션</span>
                    <button onClick={() => setPollOptions(null)} className="text-xs text-zinc-400 hover:text-white transition-colors">투표 제거</button>
                  </div>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={opt} onChange={(e) => setPollOptions(prev => prev!.map((o, j) => j === i ? e.target.value : o))} maxLength={40} placeholder={`옵션 ${i + 1}`}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(prev => prev!.filter((_, j) => j !== i))} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/[0.08]">
                          <Image src="/Close-Fill.svg" alt="제거" width={11} height={11} style={{ filter: 'invert(0.5)' }} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 4 && (
                    <button onClick={() => setPollOptions(prev => [...prev!, ''])} className="text-xs text-violet-400 hover:text-violet-300">+ 옵션 추가</button>
                  )}
                </div>
              )}

              {/* 음악 선택 드롭다운 */}
              {pickerOpen && (
                <div className="w-full max-h-48 overflow-y-auto bg-[#21252E] border border-white/[0.10] rounded-xl shadow-xl p-1.5">
                  {songService.getAll().filter(s => s.status === 'done').length === 0 ? (
                    <p className="text-xs text-zinc-500 py-4 text-center">완성된 곡이 없어요</p>
                  ) : songService.getAll().filter(s => s.status === 'done').map(s => (
                    <button key={s.id} onClick={() => { setSong({ id: s.id, title: s.title ?? null, coverImage: s.coverImage ?? null, coverHue: s.coverHue ?? null, audioUrl: s.audioUrl }); setPickerOpen(false) }} className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.06] transition text-left">
                      <SongCover coverImage={s.coverImage} coverHue={s.coverHue} size={28} />
                      <span className="text-sm text-white truncate">{s.title || '제목 없음'}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 알약 버튼 — 첨부 하나 선택 시 나머지 숨김 (한 종류만) */}
              {!hasAttachment && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => setPickerOpen(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/[0.12] text-zinc-400 hover:text-white hover:border-white/[0.25] transition active:scale-[0.96]">
                    <Image src="/Music.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.55)' }} /> 음악
                  </button>
                  <button onClick={() => { imageInputRef.current?.click(); setPickerOpen(false) }} disabled={uploadingImages}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/[0.12] text-zinc-400 hover:text-white hover:border-white/[0.25] transition active:scale-[0.96] disabled:opacity-40">
                    <Image src="/Photo-Album.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.55)' }} />
                    {uploadingImages ? '업로드 중…' : '이미지'}
                  </button>
                  <button onClick={() => { setPollOptions(['', '']); setPickerOpen(false) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/[0.12] text-zinc-400 hover:text-white hover:border-white/[0.25] transition active:scale-[0.96]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/></svg> 투표
                  </button>
                </div>
              )}
              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleImageFiles(e.target.files); e.target.value = '' }} />
            </>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4">
          <button type="button" onClick={onClose} className="px-5 py-3.5 rounded-xl text-sm text-zinc-400 hover:text-white border border-white/[0.10] hover:border-white/20 transition-colors">취소</button>
          <button type="button" disabled={saving} onClick={handleSave}
            className="flex-1 py-3.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition-colors">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
