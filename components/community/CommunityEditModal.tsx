'use client'
// 커뮤니티 정보 수정(매니저) — 대표 이미지·커버·이름·주제·소개. 이미지는 즉시 업로드/반영.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { toast } from '@/components/toast/toast'
import { GRAY_COVER, GRAY_AVATAR, GRAY_AVATAR_TEXT } from '@/components/community/hubCards'
import { ConfirmModal } from '@/components/ConfirmModal'
import { CropModal } from '@/components/CropModal'
import type { Community } from '@/types/domain'

// 커버는 원본 전체 저장(홈 16:9). 크롭 툴(7:2)은 상세 배너에서 보일 '초점'만 지정(파괴적 X). 대표 이미지는 1:1 크롭.
const COVER_ASPECT = 7 / 2
const AVATAR_ASPECT = 1

const NAME_MAX = 30
const TOPIC_MAX = 20
const DESC_MAX = 500

export function CommunityEditModal({ community, onClose, onSaved, onClosed }: {
  community: Community
  onClose: () => void
  onSaved: (c: Community) => void
  onClosed: () => void   // 폐쇄 완료 → 부모가 목록으로 이동
}) {
  const [name, setName] = useState(community.name)
  const [topic, setTopic] = useState(community.topic ?? '')
  const [description, setDescription] = useState(community.description ?? '')
  const [coverUrl, setCoverUrl] = useState(community.coverImage)
  const [coverFocus, setCoverFocus] = useState(community.coverFocus ?? '50% 50%')
  const [avatarUrl, setAvatarUrl] = useState(community.avatarImage)
  const [uploading, setUploading] = useState<'cover' | 'avatar' | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [cropState, setCropState] = useState<{ file: File; type: 'cover' | 'avatar' } | null>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)

  const canSave = name.trim().length >= 2 && !saving && !uploading

  // 대표 이미지: 1:1 크롭 Blob 업로드
  async function uploadAvatarBlob(blob: Blob) {
    setUploading('avatar')
    const fd = new FormData()
    fd.append('type', 'avatar')
    fd.append('file', blob, 'avatar.webp')
    const res = await fetch(`/api/communities/${community.id}/image`, { method: 'POST', body: fd })
    setUploading(null)
    if (!res.ok) { toast.error('이미지 업로드에 실패했어요'); return }
    const j = await res.json()
    setAvatarUrl(j.url)
    onSaved(j.community)
  }

  // 커버: 원본 전체 업로드 + 초점(object-position) 저장
  async function uploadCover(file: File, focus: string) {
    setUploading('cover')
    const fd = new FormData()
    fd.append('type', 'cover')
    fd.append('file', file)      // 원본 그대로 (서버가 webp 다운스케일, 크롭 X)
    fd.append('focus', focus)
    const res = await fetch(`/api/communities/${community.id}/image`, { method: 'POST', body: fd })
    setUploading(null)
    if (!res.ok) { toast.error('이미지 업로드에 실패했어요'); return }
    const j = await res.json()
    setCoverUrl(j.url); setCoverFocus(focus)
    onSaved(j.community)
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const res = await fetch(`/api/communities/${community.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), topic: topic.trim() || null, description: description.trim() || null }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error === 'invalid_name' ? '커뮤니티 이름은 2~30자로 입력해 주세요' : j.error === 'banned_word' ? '부적절한 표현이 포함되어 있어요' : '저장에 실패했어요')
      return
    }
    const j = await res.json()
    toast.success('커뮤니티 정보를 수정했어요')
    onSaved(j.community)
    onClose()
  }

  async function handleCloseCommunity() {
    setConfirmClose(false)
    const res = await fetch(`/api/communities/${community.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('커뮤니티를 폐쇄했어요'); onClosed() }
    else toast.error('폐쇄에 실패했어요')
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full h-full md:h-auto md:max-w-[480px] md:max-h-[85vh] md:mx-4 bg-[#181B22] md:border border-white/[0.10] rounded-none md:rounded-2xl shadow-2xl flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">커뮤니티 수정</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center transition-colors">
            <Image src="/Close-Fill.svg" alt="닫기" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 커버 — 미리보기는 상세 페이지에서 잘리는 배너 비율(7:2)로 표시 */}
          <div>
            <label className="text-xs text-zinc-500">커버 이미지</label>
            <div className="relative w-full aspect-[9/4] md:aspect-[7/2] rounded-xl overflow-hidden mt-1.5" style={{ background: GRAY_COVER }}>
              {coverUrl && <img src={coverUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: coverFocus }} />}
              {uploading === 'cover' && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button type="button" onClick={() => coverRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12] transition-colors">커버 변경</button>
              <p className="text-[11px] text-zinc-600">상세 페이지 배너 기준 미리보기 (홈에서는 원본 전체 표시)</p>
            </div>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropState({ file: f, type: 'cover' }); e.target.value = '' }} />
          </div>

          {/* 대표 이미지 (사각형 — 프로필 원형과 구분). 커버 섹션과 동일 구조(라벨→미리보기→변경 버튼) */}
          <div>
            <label className="text-xs text-zinc-500">대표 이미지</label>
            <div className="relative w-[88px] h-[88px] rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-bold mt-1.5" style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : name.slice(0, 1).toUpperCase()}
              {uploading === 'avatar' && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button type="button" onClick={() => avatarRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12] transition-colors">이미지 변경</button>
              <p className="text-[11px] text-zinc-600">정방형 이미지를 권장해요</p>
            </div>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropState({ file: f, type: 'avatar' }); e.target.value = '' }} />
          </div>

          {/* 이름 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">커뮤니티 이름</label>
              <span className="text-[11px] text-zinc-600">{name.length} / {NAME_MAX}</span>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder="커뮤니티 이름"
              className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors" />
          </div>

          {/* 주제 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">주제</label>
              <span className="text-[11px] text-zinc-600">{topic.length} / {TOPIC_MAX}</span>
            </div>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={TOPIC_MAX} placeholder="예: 발라드, 로파이"
              className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors" />
          </div>

          {/* 소개 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">소개</label>
              <span className="text-[11px] text-zinc-600">{description.length} / {DESC_MAX}</span>
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DESC_MAX} rows={4} placeholder="커뮤니티를 소개해 주세요"
              className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors resize-none" />
          </div>

          {/* 폐쇄 (danger) */}
          <div className="pt-2 border-t border-white/[0.06]">
            <button type="button" onClick={() => setConfirmClose(true)} className="text-xs text-red-400/80 hover:text-red-400 transition-colors">
              커뮤니티 폐쇄
            </button>
            <p className="text-[11px] text-zinc-600 mt-1">폐쇄하면 모든 글·멤버가 삭제되며 되돌릴 수 없어요.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-white/[0.06]">
          <button type="button" onClick={onClose} className="px-5 py-3.5 rounded-xl text-sm text-zinc-400 hover:text-white border border-white/[0.10] hover:border-white/20 transition-colors">취소</button>
          <button type="button" disabled={!canSave} onClick={handleSave}
            className={`flex-1 py-3.5 rounded-xl text-sm font-semibold transition-colors ${canSave ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'}`}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      <ConfirmModal open={confirmClose} zClassName="z-[90]" title="이 커뮤니티를 정말 폐쇄하시겠어요?" description="모든 글·멤버가 삭제되며 되돌릴 수 없어요." confirmLabel="폐쇄하기" cancelLabel="아니요" variant="danger" onClose={() => setConfirmClose(false)} onConfirm={handleCloseCommunity} />

      <CropModal
        open={!!cropState}
        imageFile={cropState?.file ?? null}
        aspect={cropState?.type === 'avatar' ? AVATAR_ASPECT : COVER_ASPECT}
        mode={cropState?.type === 'avatar' ? 'crop' : 'focus'}
        outputMaxPx={512}
        title={cropState?.type === 'avatar' ? '대표 이미지 위치 조정' : '커버 위치 조정'}
        onCancel={() => setCropState(null)}
        onConfirm={(blob) => { setCropState(null); uploadAvatarBlob(blob) }}
        onConfirmFocus={(pos) => { const f = cropState?.file; setCropState(null); if (f) uploadCover(f, pos) }}
      />
    </div>,
    document.body,
  )
}
