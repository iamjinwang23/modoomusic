import { NextRequest, NextResponse } from 'next/server'
import { generateSong, generateCoverImage, MOCK_MODE, MODELS, creditsForModel, type MusicModelId } from '@/services/minimax.service'
import { uploadFromUrl } from '@/services/storage.service'
import { createUserClient } from '@/lib/supabase/server'
import { tryConsumeCredits, refundCredits } from '@/services/credit.service'

// 이미지 생성 프롬프트 우선순위: 가사 → 제목 → 스타일
// 의미 없는 단순 반복(ㅋㅋ, 1111 등)은 의도하지 않은 결과를 피하기 위해
// 다음 후보로 fallback. 그 외엔 MiniMax의 prompt_optimizer가 추상 이미지로 보정.
function pickImagePrompt({ customLyrics, title, prompt }: { customLyrics?: string; title?: string; prompt: string }): string {
  const cleanLyrics = (typeof customLyrics === 'string' ? customLyrics : '').replace(/\[.*?\]/g, '').trim()
  if (isMeaningful(cleanLyrics, 12)) return cleanLyrics.slice(0, 300)
  const t = (typeof title === 'string' ? title : '').trim()
  if (isMeaningful(t, 2)) return t
  return prompt.trim()
}

// 의미있는 문자열 판정: 길이 + 고유 문자 비율
function isMeaningful(s: string, minLen: number): boolean {
  if (s.length < minLen) return false
  const noWhitespace = s.replace(/\s+/g, '')
  if (noWhitespace.length === 0) return false
  const uniqueChars = new Set(noWhitespace.split('')).size
  // 고유 문자가 너무 적으면 (예: 'ㅋㅋㅋㅋㅋ', '11111') 의미없음으로 판단
  return uniqueChars >= 3
}

export async function POST(req: NextRequest) {
  const { prompt, genre, mood, title, customLyrics, instrumental, model, audioBase64 } = await req.json()

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '스타일을 입력해주세요' }, { status: 400 })
  }

  // MiniMax는 가사 모드에서 너무 짧은 가사를 거부 → 사전 차단
  const trimmedLyrics = typeof customLyrics === 'string' ? customLyrics.trim() : ''
  if (!instrumental && trimmedLyrics.length > 0 && trimmedLyrics.length < 10) {
    return NextResponse.json(
      { error: '가사가 너무 짧아요. 최소 10자 이상 입력하거나 비워두면 인스트루멘탈로 만들어져요' },
      { status: 400 },
    )
  }

  // ── 1) 인증 확인 (쿠키 세션 기반)
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  }

  // ── 2) 모델 잠금 확인 (1차 출시: Music 2.0만 허용)
  const modelDef = MODELS.find((m) => m.id === model)
  if (!modelDef) {
    return NextResponse.json({ error: '알 수 없는 모델이에요' }, { status: 400 })
  }
  if (modelDef.locked) {
    return NextResponse.json({ error: '이 모델은 곧 출시될 Plus 플랜에서 이용할 수 있어요', code: 'MODEL_LOCKED' }, { status: 403 })
  }

  // ── 3) 크레딧 차감 (선차감, 실패 시 환불)
  const cost = creditsForModel(model as MusicModelId)
  const consume = await tryConsumeCredits(user.id, cost)
  if (!consume.ok) {
    const isExhausted = consume.state.remaining === 0
    const message = isExhausted
      ? '오늘의 크레딧을 모두 사용했어요. 내일 자정에 리셋돼요'
      : `크레딧이 부족해요. 남은 ${consume.state.remaining}크레딧 (필요 ${cost}크레딧)`
    return NextResponse.json(
      { error: message, code: 'DAILY_LIMIT', credits: consume.state },
      { status: 429 },
    )
  }

  // ── 4) MiniMax 호출
  try {
    const imagePromptInput = pickImagePrompt({ customLyrics, title, prompt })
    const [songResult, coverUrl] = await Promise.all([
      generateSong({ prompt: prompt.trim(), genre, mood, customLyrics, instrumental, model, audioBase64 }),
      generateCoverImage([genre, mood, imagePromptInput].filter(Boolean).join(', ')),
    ])

    // MiniMax URL은 24시간 후 만료 → Supabase Storage에 영구 저장
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

    return NextResponse.json({
      ...songResult,
      audioUrl: finalAudioUrl,
      coverUrl: finalCoverUrl,
      credits: consume.state,
    })
  } catch (e) {
    await refundCredits(user.id, cost)
    const message = e instanceof Error ? e.message : 'API 오류'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
