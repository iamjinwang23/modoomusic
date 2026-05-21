import { NextRequest, NextResponse } from 'next/server'
import { generateSong, generateCoverImage, MOCK_MODE } from '@/services/minimax.service'
import { uploadFromUrl } from '@/services/storage.service'

export async function POST(req: NextRequest) {
  const { prompt, genre, mood, customLyrics, instrumental, model, audioBase64 } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '스타일을 입력해주세요' }, { status: 400 })
  }

  try {
    const [songResult, coverUrl] = await Promise.all([
      generateSong({ prompt: prompt.trim(), genre, mood, customLyrics, instrumental, model, audioBase64 }),
      generateCoverImage([genre, mood, prompt.trim()].filter(Boolean).join(', ')),
    ])

    // MiniMax URL은 24시간 후 만료 → Supabase Storage에 영구 저장
    // Mock 모드에서는 이미 영구 URL이므로 업로드 생략
    let finalAudioUrl = songResult.audioUrl
    let finalCoverUrl = coverUrl

    if (!MOCK_MODE) {
      const storageId = crypto.randomUUID()
      const [permanentAudioUrl, permanentCoverUrl] = await Promise.all([
        uploadFromUrl(songResult.audioUrl, 'songs-audio', `${storageId}.mp3`),
        coverUrl ? uploadFromUrl(coverUrl, 'songs-covers', `${storageId}.jpg`) : Promise.resolve(null),
      ])
      if (permanentAudioUrl) finalAudioUrl = permanentAudioUrl
      if (permanentCoverUrl) finalCoverUrl = permanentCoverUrl
    }

    return NextResponse.json({ ...songResult, audioUrl: finalAudioUrl, coverUrl: finalCoverUrl })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'API 오류'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
