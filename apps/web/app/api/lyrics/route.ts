import { NextRequest, NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase/server'
import { evaluateLyricsRate, commitLyricsGen, generateLyrics } from '@/services/lyrics.service'

// AI 가사 생성 — MiniMax 전용 lyrics_generation. 크레딧 미소모, 연타 방지 레이트리밋.
// Design Ref: ai-lyrics-gen §4.1
export async function POST(req: NextRequest) {
  const { prompt } = await req.json()

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ error: '프롬프트를 입력해 주세요', code: 'INVALID' }, { status: 400 })
  }

  // 1) 인증
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // 2) 레이트리밋 (15초 쿨다운 + 1분 2회). 잔여 시간은 노출하지 않음.
  const rate = await evaluateLyricsRate(user.id)
  if (!rate.ok) {
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요', code: 'RATE_LIMITED' }, { status: 429 })
  }

  // 3) MiniMax 가사 생성
  try {
    const { lyrics, songTitle } = await generateLyrics(prompt.trim())
    // 4) 성공 시에만 타임스탬프 시프트
    await commitLyricsGen(user.id, rate.row)
    return NextResponse.json({ lyrics, songTitle })
  } catch (e) {
    const message = e instanceof Error ? e.message : '가사를 만드는 중 문제가 생겼어요'
    return NextResponse.json({ error: message, code: 'MINIMAX_ERROR' }, { status: 502 })
  }
}
