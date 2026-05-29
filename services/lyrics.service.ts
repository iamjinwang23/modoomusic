import { createAdminClient } from '@/lib/supabase/admin'
import { MOCK_MODE } from '@/services/minimax.service'

// AI 가사 생성 — MiniMax 전용 lyrics_generation API. 곡 생성과 분리되어 음악 크레딧 비용 없음.
// 연타 방지 레이트리밋: 15초 쿨다운 + 1분 2회. 타임스탬프 2개만으로 두 규칙 충족.
// Design Ref: ai-lyrics-gen §3, §6

const COOLDOWN_MS = 15_000  // 생성 간 최소 간격
const WINDOW_MS = 60_000    // 1분 윈도우
const MAX_PROMPT = 2000     // MiniMax prompt 상한

const MOCK_LYRICS = `[Verse]
오늘 하루도 이렇게 흘러가
창밖에 내리는 빗소리처럼
마음 한켠에 쌓여가는 이야기
누군가에게 전하고 싶어

[Chorus]
노래로 담아봐 이 순간을
말로 할 수 없는 감정들을
선율에 실어서 너에게 전해
오늘의 내 하루를

[Bridge]
시간이 흘러도 변하지 않을
이 멜로디 안에 너와 나

[Outro]
오늘의 노래로`

export interface RateRow {
  last_lyrics_gen_at: string | null
  prev_lyrics_gen_at: string | null
}

// 1) 레이트리밋 평가 (읽기). ok=false면 429.
export async function evaluateLyricsRate(userId: string): Promise<{ ok: boolean; row: RateRow }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('last_lyrics_gen_at, prev_lyrics_gen_at')
    .eq('id', userId)
    .maybeSingle()

  const row: RateRow = {
    last_lyrics_gen_at: data?.last_lyrics_gen_at ?? null,
    prev_lyrics_gen_at: data?.prev_lyrics_gen_at ?? null,
  }
  const now = Date.now()
  const last = row.last_lyrics_gen_at ? new Date(row.last_lyrics_gen_at).getTime() : 0
  const prev = row.prev_lyrics_gen_at ? new Date(row.prev_lyrics_gen_at).getTime() : 0

  if (last && now - last < COOLDOWN_MS) return { ok: false, row }  // 쿨다운
  if (prev && now - prev < WINDOW_MS) return { ok: false, row }    // 최근 1분에 이미 2회
  return { ok: true, row }
}

// 2) 생성 성공 후 타임스탬프 시프트 (prev <- 기존 last, last <- now)
export async function commitLyricsGen(userId: string, row: RateRow): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('profiles')
    .update({
      prev_lyrics_gen_at: row.last_lyrics_gen_at,
      last_lyrics_gen_at: new Date().toISOString(),
    })
    .eq('id', userId)
}

// 3) MiniMax 가사 생성
export async function generateLyrics(prompt: string): Promise<string> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 1200))
    return MOCK_LYRICS
  }

  const res = await fetch('https://api.minimax.io/v1/lyrics_generation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'write_full_song', prompt: prompt.slice(0, MAX_PROMPT) }),
  })

  const data = await res.json()
  if (data.base_resp?.status_code !== 0) {
    throw mapLyricsError(data.base_resp?.status_code)
  }
  return sanitizeLyrics(typeof data.lyrics === 'string' ? data.lyrics : '')
}

// MiniMax status_code → 한국어 메시지 (translateMinimaxError와 동일 톤)
export function mapLyricsError(code?: number): Error & { code: string } {
  const msg: Record<number, string> = {
    1002: '지금 너무 많이 생성되고 있어요. 잠시 후 다시 시도해 주세요',
    1004: '서버 인증 문제가 생겼어요. 잠시 후 다시 시도해 주세요',
    2049: '서버 인증 문제가 생겼어요. 잠시 후 다시 시도해 주세요',
    1008: '서비스 크레딧이 부족해요. 관리자에게 문의해 주세요',
    1026: '입력한 내용이 정책에 맞지 않아요. 다른 표현으로 시도해 주세요',
    2013: '요청에 문제가 있어요. 다시 시도해 주세요',
  }
  const e = new Error(msg[code ?? -1] ?? '가사를 만드는 중 문제가 생겼어요') as Error & { code: string }
  e.code = 'MINIMAX_ERROR'
  return e
}

// 구조 태그가 아닌 대괄호 지문 라인만 제거 (예: [soft piano], [wind sfx]).
// 괄호 () 보컬 애드립은 의도된 가창이라 유지. 화이트리스트 기반 최소 필터.
const ALLOWED_TAGS = new Set([
  'intro', 'verse', 'pre chorus', 'chorus', 'post chorus', 'hook', 'drop',
  'bridge', 'solo', 'build up', 'instrumental', 'inst', 'breakdown', 'break',
  'interlude', 'transition', 'outro',
])

function sanitizeLyrics(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => {
      const m = line.trim().match(/^\[(.+)\]$/)
      if (!m) return true  // 대괄호 단독 라인이 아니면 보존
      // 정규화: 소문자, 하이픈/언더스코어→공백, 숫자 제거, 공백 압축
      const norm = m[1].toLowerCase().replace(/[-_]/g, ' ').replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
      return ALLOWED_TAGS.has(norm)  // 알려진 구조 태그만 유지, 지문은 제거
    })
    .join('\n')
    .trim()
}
