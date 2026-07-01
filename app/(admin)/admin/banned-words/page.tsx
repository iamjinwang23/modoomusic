'use client'
// 금칙어 관리 — 목록(칩) + 추가/삭제
import { useState, useEffect, useCallback } from 'react'
import { AdminPanel } from '@/components/admin/AdminPanel'

interface Word { id: string; word: string; createdAt: string }

export default function AdminBannedWordsPage() {
  const [words, setWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/banned-words')
      const d = await r.json()
      setWords(d.words ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const w = input.trim()
    if (!w || busy) return
    setBusy(true)
    const r = await fetch('/api/admin/banned-words', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word: w }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(d.error === 'duplicate' ? '이미 등록된 단어예요' : '추가에 실패했어요'); return }
    setInput(''); setMsg(null); load()
  }

  async function remove(id: string) {
    if (!window.confirm('이 금칙어를 삭제할까요?')) return
    await fetch(`/api/admin/banned-words/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900">금칙어 관리</h1>
        <p className="text-sm text-zinc-500 mt-1">등록된 단어가 포함된 커뮤니티 글·댓글, 곡 제목/소개, 프로필 이름/소개는 등록·수정이 차단됩니다. (공백·대소문자 무시, 부분일치)</p>
      </header>

      <form onSubmit={add} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="금칙어 입력"
          className="flex-1 border border-[#ebebeb] rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-400" />
        <button type="submit" disabled={busy || !input.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-900 text-white disabled:opacity-40">추가</button>
      </form>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <AdminPanel title="등록된 금칙어" description={loading ? '불러오는 중…' : `${words.length}개`}>
        <div className="flex flex-wrap gap-2">
          {words.map((w) => (
            <span key={w.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-zinc-100 text-sm text-zinc-800">
              {w.word}
              <button onClick={() => remove(w.id)} className="w-4 h-4 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-500 transition-colors text-xs" aria-label="삭제">✕</button>
            </span>
          ))}
          {!loading && words.length === 0 && <p className="text-sm text-zinc-500 py-4">등록된 금칙어가 없어요</p>}
        </div>
      </AdminPanel>
    </div>
  )
}
