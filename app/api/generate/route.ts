import { NextRequest, NextResponse } from 'next/server'
import { generateSong } from '@/services/minimax.service'

export async function POST(req: NextRequest) {
  const { prompt, genre, mood, customLyrics, instrumental } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '스타일을 입력해주세요' }, { status: 400 })
  }

  try {
    const result = await generateSong({ prompt: prompt.trim(), genre, mood, customLyrics, instrumental })
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'API 오류'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
