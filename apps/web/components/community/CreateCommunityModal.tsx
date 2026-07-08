// 커뮤니티 개설 모달 — 1인 최대 3개. 이름·주제·소개. (커버 이미지는 추후)
'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/toast/toast'

interface Props {
  open: boolean
  onClose: () => void
}

export function CreateCommunityModal({ open, onClose }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [joinRules, setJoinRules] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open || typeof document === 'undefined') return null

  async function submit() {
    if (busy) return
    if (name.trim().length < 2) { toast.error('커뮤니티 이름을 2자 이상 입력해 주세요'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/communities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), topic: topic.trim(), description: description.trim(), visibility, joinRules: visibility === 'private' ? joinRules.trim() : '' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j.error === 'community_limit_reached' ? '커뮤니티는 최대 3개까지 만들 수 있어요' : j.error === 'banned_word' ? '부적절한 표현이 포함되어 있어요' : '개설에 실패했어요')
        return
      }
      toast.success('커뮤니티를 만들었어요')
      onClose()
      router.push(`/community/${j.community.id}`)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-[#21252E] border border-white/[0.10] rounded-2xl w-full max-w-[420px] p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-white">커뮤니티 만들기</h2>
        <p className="mt-1 text-xs text-zinc-400">한 명당 최대 3개까지 운영할 수 있어요. 당신이 매니저가 됩니다.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] text-zinc-400">이름 <span className="text-violet-400">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="예: 로파이 작업실"
              className="mt-1 w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-400">주제</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={40} placeholder="예: 잔잔한 비트, 공부할 때 듣는 음악"
              className="mt-1 w-full bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-400">소개</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="어떤 커뮤니티인가요?"
              className="mt-1 w-full h-20 bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-400">공개 설정</label>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setVisibility('public')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${visibility === 'public' ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]'}`}>공개</button>
              <button type="button" onClick={() => setVisibility('private')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${visibility === 'private' ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]'}`}>비공개</button>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">{visibility === 'private' ? '멤버만 글을 볼 수 있고, 가입은 매니저 승인이 필요해요.' : '누구나 글을 보고 바로 가입할 수 있어요.'}</p>
          </div>
          {visibility === 'private' && (
            <div>
              <label className="text-[11px] text-zinc-400">가입 수칙 (선택)</label>
              <textarea value={joinRules} onChange={(e) => setJoinRules(e.target.value)} maxLength={1000} placeholder="가입 신청 시 보여줄 안내나 규칙을 적어주세요"
                className="mt-1 w-full h-20 bg-white/[0.04] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={busy ? undefined : onClose} disabled={busy} className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/[0.06] transition disabled:opacity-40">취소</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition active:scale-[0.98] disabled:opacity-40">{busy ? '만드는 중…' : '만들기'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
