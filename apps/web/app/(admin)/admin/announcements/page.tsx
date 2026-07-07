// Design Ref: §5.2 Module 7 — 공지 송출. 목록 + 작성/수정/숨김/삭제.
'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { AdminConfirm } from '@/components/admin/AdminConfirm'
import { AnnouncementEditor } from '@/components/admin/AnnouncementEditor'
import { ANNOUNCEMENT_CATEGORY_LABEL } from '@/types/domain'
import type { Announcement } from '@/types/domain'

type EditorState = { mode: 'new' } | { mode: 'edit'; item: Announcement } | null
type ConfirmState =
  | { kind: 'hide'; item: Announcement }
  | { kind: 'show'; item: Announcement }
  | { kind: 'delete'; item: Announcement }
  | { kind: 'notify'; item: Announcement }
  | null

// 공개 + 노출 가능(예약 시각 지남) → 알림 발송 가능
function isVisible(a: Announcement): boolean {
  return a.status === 'published' && (!a.publishAt || new Date(a.publishAt).getTime() <= Date.now())
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[] | null>(null)
  const [editor, setEditor] = useState<EditorState>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/announcements')
    if (!res.ok) { setItems([]); return }
    const json = await res.json()
    setItems(json.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function handleConfirm(reason: string) {
    if (!confirm) return
    const { kind, item } = confirm
    const res = kind === 'delete'
      ? await fetch(`/api/admin/announcements/${item.id}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        })
      : kind === 'notify'
      ? await fetch(`/api/admin/announcements/${item.id}/notify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
        })
      : await fetch(`/api/admin/announcements/${item.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: kind === 'hide' ? 'hidden' : 'published', reason }),
        })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? '실패')
    }
    setConfirm(null)
    load()
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">공지</h1>
          <p className="text-sm text-zinc-500 mt-1">What&apos;s New 페이지에 게시되는 공지·프로모션 관리</p>
        </div>
        <button
          onClick={() => setEditor({ mode: 'new' })}
          className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-[#171717] hover:bg-[#383838] text-white transition-colors"
        >
          ＋ 새 공지
        </button>
      </header>

      <AdminPanel>
        {items === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-zinc-50 shimmer" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-zinc-500 py-10 text-center">아직 작성한 공지가 없어요. ‘＋ 새 공지’로 시작하세요.</p>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border border-[#ebebeb] rounded-lg p-3">
                <div className="relative w-20 h-12 rounded-md overflow-hidden bg-zinc-100 shrink-0">
                  {a.imageUrl && <Image src={a.imageUrl} alt="" fill unoptimized className="object-cover" sizes="80px" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${a.category === 'notice' ? 'bg-[#eef4ff] text-[#0761d1]' : a.category === 'feature' ? 'bg-[#f1ecfe] text-[#6d28d9]' : 'bg-[#f9e8f3] text-[#b3146b]'}`}>
                      {ANNOUNCEMENT_CATEGORY_LABEL[a.category]}
                    </span>
                    {a.status === 'hidden' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-600">숨김</span>
                    )}
                    {a.status === 'published' && a.publishAt && new Date(a.publishAt).getTime() > Date.now() && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#fff3d6] text-[#946200]">
                        예약 {new Date(a.publishAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-900 truncate">{a.title}</p>
                  <p className="text-xs text-zinc-400">
                    {fmtDate(a.createdAt)}
                    {a.notifiedAt && <span className="ml-2 text-[#0761d1]">· 알림 발송됨</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isVisible(a) && (
                    <button
                      onClick={() => setConfirm({ kind: 'notify', item: a })}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#0070f3] hover:bg-[#0761d1] text-white"
                    >
                      {a.notifiedAt ? '재발송' : '알림 보내기'}
                    </button>
                  )}
                  <button onClick={() => setEditor({ mode: 'edit', item: a })} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#eef4ff] hover:bg-[#d3e5ff] text-[#0761d1]">수정</button>
                  {a.status === 'published' ? (
                    <button onClick={() => setConfirm({ kind: 'hide', item: a })} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700">숨김</button>
                  ) : (
                    <button onClick={() => setConfirm({ kind: 'show', item: a })} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700">공개</button>
                  )}
                  <button onClick={() => setConfirm({ kind: 'delete', item: a })} className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>

      {editor && (
        <AnnouncementEditor
          mode={editor.mode}
          initial={editor.mode === 'edit' ? editor.item : undefined}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}

      <AdminConfirm
        open={!!confirm}
        title={
          confirm?.kind === 'delete' ? '공지 삭제'
          : confirm?.kind === 'hide' ? '공지 숨김'
          : confirm?.kind === 'notify' ? '전체 알림 보내기'
          : '공지 공개'
        }
        description={
          confirm
            ? confirm.kind === 'notify'
              ? `“${confirm.item.title}” — 탈퇴하지 않은 전체 사용자에게 알림을 보냅니다.${confirm.item.notifiedAt ? ' 이미 받은 사용자는 제외돼요.' : ''}`
              : `“${confirm.item.title}” ${confirm.kind === 'delete' ? '— 삭제하면 복구할 수 없어요' : confirm.kind === 'hide' ? '— What’s New에서 숨깁니다' : '— What’s New에 다시 게시합니다'}`
            : ''
        }
        confirmLabel={confirm?.kind === 'delete' ? '삭제' : confirm?.kind === 'hide' ? '숨김' : confirm?.kind === 'notify' ? '알림 발송' : '공개'}
        variant={confirm?.kind === 'delete' ? 'danger' : 'default'}
        requireReason={confirm?.kind !== 'notify'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
