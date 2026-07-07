// 금칙어(사전 필터) — 서버 전용. 목록은 60초 캐시. 정규화(소문자·공백제거) 후 부분일치.
import { createAdminClient } from '@/lib/supabase/admin'

interface Cache { words: string[]; at: number }
let cache: Cache | null = null
const TTL = 60_000

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '')
}

async function loadWords(): Promise<string[]> {
  const now = Date.now()
  if (cache && now - cache.at < TTL) return cache.words
  const admin = createAdminClient()
  const { data } = await admin.from('banned_words').select('word')
  const words = (data ?? []).map((r) => normalize(r.word as string)).filter(Boolean)
  cache = { words, at: now }
  return words
}

export function invalidateBannedWords(): void { cache = null }

// 하나라도 포함되면 매칭된 단어 반환, 없으면 null
export async function findBannedWord(...texts: (string | null | undefined)[]): Promise<string | null> {
  const joined = normalize(texts.filter(Boolean).join(' '))
  if (!joined) return null
  const words = await loadWords()
  for (const w of words) if (w && joined.includes(w)) return w
  return null
}

// ── 어드민 CRUD ───────────────────────────────
export async function listBannedWords(): Promise<{ id: string; word: string; createdAt: string }[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('banned_words').select('id, word, created_at').order('word', { ascending: true })
  return (data ?? []).map((r) => ({ id: r.id as string, word: r.word as string, createdAt: r.created_at as string }))
}

export async function addBannedWord(word: string, adminUserId: string): Promise<{ ok: boolean; error?: string }> {
  const w = normalize(word)
  if (!w) return { ok: false, error: 'empty' }
  const admin = createAdminClient()
  const { error } = await admin.from('banned_words').insert({ word: w, created_by: adminUserId })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'duplicate' }
    return { ok: false, error: 'internal' }
  }
  invalidateBannedWords()
  return { ok: true }
}

export async function removeBannedWord(id: string): Promise<{ ok: boolean }> {
  const admin = createAdminClient()
  await admin.from('banned_words').delete().eq('id', id)
  invalidateBannedWords()
  return { ok: true }
}
