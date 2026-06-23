// 공지 작성/수정 에디터 — 분할 라이브 미리보기 + 이미지 첨부/본문 삽입 + 카테고리 + 발행 알림
'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Markdown } from '@/components/Markdown'
import { uploadAnnouncementImage } from '@/utils/imageUpload'
import type { Announcement, AnnouncementCategory } from '@/types/domain'

interface Props {
  mode: 'new' | 'edit'
  initial?: Announcement
  onClose: () => void
  onSaved: () => void
}

const CATEGORIES: { value: AnnouncementCategory; label: string }[] = [
  { value: 'notice', label: '공지' },
  { value: 'promotion', label: '프로모션' },
  { value: 'feature', label: '새로운 기능' },
]

// ISO → datetime-local 입력값(YYYY-MM-DDTHH:mm, 로컬 시간)
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function AnnouncementEditor({ mode, initial, onClose, onSaved }: Props) {
  // 새 글이면 클라이언트에서 id 생성 — 본문/썸네일 이미지 경로를 미리 확정
  const [id] = useState(() => initial?.id ?? crypto.randomUUID())
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState<AnnouncementCategory>(initial?.category ?? 'notice')
  const [content, setContent] = useState(initial?.content ?? '')
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null)
  const [status, setStatus] = useState<'published' | 'hidden'>(initial?.status ?? 'published')
  const [publishAt, setPublishAt] = useState(isoToLocalInput(initial?.publishAt)) // '' = 즉시
  const [notify, setNotify] = useState(false)
  const [reason, setReason] = useState('')
  // 팝업 노출 (우측 하단 카드) — 동시 1개만, 저장 시 기존 팝업 자동 해제
  const [popupEnabled, setPopupEnabled] = useState(initial?.popupEnabled ?? false)
  const [popupStartsAt, setPopupStartsAt] = useState(isoToLocalInput(initial?.popupStartsAt))
  const [popupEndsAt, setPopupEndsAt] = useState(isoToLocalInput(initial?.popupEndsAt))

  const scheduledFuture = !!publishAt && new Date(publishAt).getTime() > Date.now()

  const [uploadingThumb, setUploadingThumb] = useState(false)
  const [insertingImg, setInsertingImg] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const thumbInput = useRef<HTMLInputElement>(null)
  const bodyImgInput = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingThumb(true); setError('')
    const url = await uploadAnnouncementImage(id, file, 'thumb')
    setUploadingThumb(false)
    if (!url) { setError('썸네일 업로드 실패'); return }
    setImageUrl(url)
  }

  async function handleBodyImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setInsertingImg(true); setError('')
    const url = await uploadAnnouncementImage(id, file, `img-${Date.now()}`)
    setInsertingImg(false)
    if (!url) { setError('이미지 업로드 실패'); return }
    // 커서 위치에 마크다운 이미지 삽입
    const ta = textareaRef.current
    const snippet = `\n![](${url})\n`
    if (ta) {
      const start = ta.selectionStart
      setContent((c) => c.slice(0, start) + snippet + c.slice(start))
    } else {
      setContent((c) => c + snippet)
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError('제목을 입력하세요'); return }
    // 최초 작성(new)은 사유 생략 — 서버가 자동 생성. 수정(edit)만 사유 필수.
    if (mode === 'edit' && reason.trim().length < 5) { setError('변경 사유를 5자 이상 입력하세요 (감사 로그)'); return }
    setBusy(true); setError('')
    const publishAtIso = publishAt ? new Date(publishAt).toISOString() : null
    const popupStartsAtIso = popupEnabled && popupStartsAt ? new Date(popupStartsAt).toISOString() : null
    const popupEndsAtIso = popupEnabled && popupEndsAt ? new Date(popupEndsAt).toISOString() : null
    try {
      const res = mode === 'new'
        ? await fetch('/api/admin/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, title, category, content, imageUrl, status, notify, publishAt: publishAtIso, popupEnabled, popupStartsAt: popupStartsAtIso, popupEndsAt: popupEndsAtIso }),
          })
        : await fetch(`/api/admin/announcements/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, content, imageUrl, status, reason, publishAt: publishAtIso, popupEnabled, popupStartsAt: popupStartsAtIso, popupEndsAt: popupEndsAtIso }),
          })
      const json = await res.json()
      if (!res.ok) { setError(`저장 실패: ${json.error ?? res.status}`); setBusy(false); return }
      onSaved()
      onClose()
    } catch {
      setError('네트워크 오류')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white border border-[#ebebeb] rounded-lg shadow-xl w-full max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">{mode === 'new' ? '새 공지 작성' : '공지 수정'}</h2>
          <button onClick={busy ? undefined : onClose} className="w-7 h-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 제목 + 카테고리 */}
          <div className="flex gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              className="flex-1 bg-zinc-50 border border-[#ebebeb] rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-[#0070f3]"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
              className="bg-zinc-50 border border-[#ebebeb] rounded-lg px-3 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* 썸네일 */}
          <div>
            <label className="text-xs text-zinc-500">썸네일</label>
            <div className="flex items-center gap-3 mt-1">
              <div className="relative w-28 h-16 rounded-lg overflow-hidden bg-zinc-100 border border-[#ebebeb] shrink-0">
                {imageUrl && <Image src={imageUrl} alt="" fill unoptimized className="object-cover" sizes="112px" />}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => thumbInput.current?.click()}
                  disabled={uploadingThumb}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#eef4ff] hover:bg-[#d3e5ff] text-[#0761d1] disabled:opacity-50"
                >
                  {uploadingThumb ? '업로드 중…' : imageUrl ? '썸네일 변경' : '썸네일 첨부'}
                </button>
                {imageUrl && (
                  <button onClick={() => setImageUrl(null)} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100">제거</button>
                )}
                <input ref={thumbInput} type="file" accept="image/*" onChange={handleThumb} className="hidden" />
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">
              권장 16:9 · 1600×900px (목록·상세 상단에 노출) · JPG·PNG·WebP — 업로드 시 WebP로 자동 변환·최적화
            </p>
          </div>

          {/* 본문 — 분할 라이브 미리보기 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">본문 (마크다운)</label>
              <button
                onClick={() => bodyImgInput.current?.click()}
                disabled={insertingImg}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#eef4ff] hover:bg-[#d3e5ff] text-[#0761d1] disabled:opacity-50"
              >
                {insertingImg ? '삽입 중…' : '＋ 이미지 삽입'}
              </button>
              <input ref={bodyImgInput} type="file" accept="image/*" onChange={handleBodyImage} className="hidden" />
            </div>
            <p className="mb-1.5 text-[11px] text-zinc-400">
              본문 이미지: 가로 최대 1600px · JPG·PNG·WebP (자동 WebP 변환). 삽입 위치는 커서 지점.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={'# 제목\n\n내용을 마크다운으로 작성하세요.\n\n- 목록\n- **굵게**, [링크](https://...)'}
                className="h-72 bg-zinc-50 border border-[#ebebeb] rounded-lg px-3 py-2.5 text-[13px] font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] resize-none"
              />
              <div className="h-72 overflow-y-auto border border-[#ebebeb] rounded-lg px-4 py-2.5 bg-white">
                {content.trim()
                  ? <Markdown content={content} variant="light" />
                  : <p className="text-sm text-zinc-400">미리보기</p>}
              </div>
            </div>
          </div>

          {/* 예약 발행 */}
          <div>
            <label className="text-xs text-zinc-500">예약 발행 (비우면 즉시 공개)</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="bg-zinc-50 border border-[#ebebeb] rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              />
              {publishAt && (
                <button onClick={() => setPublishAt('')} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100">즉시로 변경</button>
              )}
            </div>
            {scheduledFuture && (
              <p className="mt-1.5 text-[11px] text-[#0761d1]">
                예약됨 — {new Date(publishAt).toLocaleString('ko-KR')}에 What&apos;s New에 공개됩니다.
              </p>
            )}
          </div>

          {/* 팝업 노출 — 우측 하단 카드 (동시 1개) */}
          <div className="rounded-lg border border-[#ebebeb] bg-zinc-50/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
              <input type="checkbox" checked={popupEnabled} onChange={(e) => setPopupEnabled(e.target.checked)} className="accent-[#7c3aed]" />
              팝업으로 노출 (사이트 우측 하단 카드)
            </label>
            {popupEnabled && (
              <div className="mt-3 space-y-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-zinc-500 w-12 shrink-0">시작</label>
                  <input
                    type="datetime-local"
                    value={popupStartsAt}
                    onChange={(e) => setPopupStartsAt(e.target.value)}
                    className="bg-white border border-[#ebebeb] rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#7c3aed]"
                  />
                  {popupStartsAt && (
                    <button onClick={() => setPopupStartsAt('')} className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100">비우기(즉시)</button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-zinc-500 w-12 shrink-0">종료</label>
                  <input
                    type="datetime-local"
                    value={popupEndsAt}
                    onChange={(e) => setPopupEndsAt(e.target.value)}
                    className="bg-white border border-[#ebebeb] rounded-lg px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#7c3aed]"
                  />
                  {popupEndsAt && (
                    <button onClick={() => setPopupEndsAt('')} className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100">비우기(무기한)</button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400">
                  이미지와 제목만 노출됩니다. 한 번에 하나의 공지만 팝업으로 노출되며, 저장 시 기존 팝업은 자동 해제됩니다.
                </p>
              </div>
            )}
          </div>

          {/* 상태 + 발행 알림 */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={status === 'hidden'} onChange={(e) => setStatus(e.target.checked ? 'hidden' : 'published')} className="accent-[#171717]" />
              숨김 (목록·상세 비공개)
            </label>
            {mode === 'new' && (
              <label className={`flex items-center gap-2 text-sm ${status === 'hidden' || scheduledFuture ? 'text-zinc-300' : 'text-zinc-700'}`}>
                <input type="checkbox" checked={notify && !scheduledFuture && status !== 'hidden'} disabled={status === 'hidden' || scheduledFuture} onChange={(e) => setNotify(e.target.checked)} className="accent-[#0070f3]" />
                전체 사용자에게 알림 보내기
              </label>
            )}
          </div>
          {mode === 'new' && scheduledFuture && (
            <p className="text-[11px] text-zinc-400 -mt-2">※ 예약 발행은 발행 시점 알림을 보장할 수 없어 즉시 알림은 비활성화됩니다.</p>
          )}

          {/* 변경 사유 (감사 로그) — 수정 시에만. 최초 작성은 생략(서버 자동 기록) */}
          {mode === 'edit' && (
            <div>
              <label className="text-xs text-zinc-500">변경 사유 (감사 로그, 5자 이상)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="예: 오타 수정 / 일정 변경"
                className="mt-1 w-full bg-zinc-50 border border-[#ebebeb] rounded-lg px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-[#0070f3]"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* 푸터 */}
        <footer className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-100">
          <button onClick={busy ? undefined : onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40">취소</button>
          <button
            onClick={handleSave}
            disabled={busy || uploadingThumb || insertingImg}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#171717] hover:bg-[#383838] disabled:opacity-40"
          >
            {busy ? '저장 중…'
              : mode === 'new'
                ? (scheduledFuture ? '예약 저장' : (notify && status === 'published' ? '저장 + 알림 발송' : '저장'))
                : '수정 저장'}
          </button>
        </footer>
      </div>
    </div>
  )
}
