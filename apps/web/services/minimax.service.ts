// Mock mode: API 크레딧 없을 때 가짜 응답 반환
// MINIMAX_MOCK=true 또는 API 키 미설정 시 자동 활성화
const MOCK_MODE =
  process.env.MINIMAX_MOCK === 'true' ||
  !process.env.MINIMAX_API_KEY ||
  process.env.MINIMAX_API_KEY === 'your_api_key_here'

const MOCK_AUDIO_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'

const MOCK_LYRICS = `[Verse]
오늘 하루도 이렇게 흘러가
창밖에 내리는 빗소리처럼
마음 한켠에 쌓여가는 이야기
누군가에게 전하고 싶어

[Chorus]
노래로 담아봐 이 순간을
말로 할 수 없는 감정들을
선율에 실어서 너에게 전해
오늘의 내 하루를`

// MiniMax 공식 카피 기반 (https://platform.minimax.io/docs/guides/pricing-paygo)
// - 3.0: 최신 추천 모델. 보컬↑·드리프트↓, 보컬/인스트루멘탈 지원. $0.15/곡
// - 2.6: 참조 음원 커버 + 인스트루멘탈 지원. $0.15/곡
// - 2.0: 기본 (보컬+악기). 빠르고 저렴. $0.03/곡
// cover 모드는 model 단위 flag가 아닌 audioBase64 유무로 동적 분기 (music-2.6 + audio = cover)
export const MODELS = [
  { id: 'music-3.0',  label: 'Music 3.0',  desc: '가장 자연스럽고 완성도 높은 최신 모델이에요', locked: false, credits: 10 },
  { id: 'music-2.6',  label: 'Music 2.6',  desc: '좋아하는 노래 분위기를 참고해 만들 수 있어요', locked: false, credits: 10 },
  { id: 'music-2.0',  label: 'Music 2.0',  desc: '빠르고 가볍게 보컬곡을 만들 수 있어요',       locked: false, credits: 2  },
] as const

export type MusicModelId = typeof MODELS[number]['id']

export function creditsForModel(modelId: MusicModelId): number {
  return MODELS.find((m) => m.id === modelId)?.credits ?? 2
}

interface GenerateParams {
  prompt: string
  genre?: string
  mood?: string
  customLyrics?: string
  instrumental?: boolean
  model?: MusicModelId
  audioBase64?: string
}

interface GenerateResult {
  audioUrl: string
  lyrics: string
  duration: number | null  // 초 단위 — MiniMax extra_info.audio_length(ms)를 초로 변환. 없으면 null(route에서 파일크기로 폴백)
}

export async function generateSong(params: GenerateParams): Promise<GenerateResult> {
  const { prompt, genre, mood, customLyrics, instrumental = false, model = 'music-2.0', audioBase64 } = params

  // Cover 모드: music-2.6 + 참조 음원 업로드 시 활성화 (audio_base64 첨부)
  const isCoverRequest = model === 'music-2.6' && !!audioBase64
  const hasLyrics = !!customLyrics?.trim()
  const isInstrumental = !isCoverRequest && (instrumental || !hasLyrics)

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 3000))
    return {
      audioUrl: MOCK_AUDIO_URL,
      lyrics: isInstrumental ? '' : (customLyrics ?? ''),
      duration: 180,
    }
  }

  const styleTag = [genre, mood].filter(Boolean).join(', ')
  const fullPrompt = styleTag ? `${styleTag}. ${prompt}` : prompt

  const body: Record<string, unknown> = {
    model,
    prompt: fullPrompt,
    output_format: 'url',
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
  }

  // is_instrumental은 Music 3.0/2.6 계열에서만 지원. Music 2.0은 lyrics 유무로 판정
  const supportsInstrumentalFlag = model === 'music-3.0' || model === 'music-2.6'

  if (isCoverRequest) {
    body.audio_base64 = audioBase64
    if (hasLyrics) body.lyrics = customLyrics!.trim()
  } else if (supportsInstrumentalFlag) {
    body.is_instrumental = isInstrumental
    if (!isInstrumental && hasLyrics) body.lyrics = customLyrics!.trim()
  } else {
    // Music 2.0: 가사가 있으면 보컬, 없으면 instrumental (별도 flag 미지원)
    if (!isInstrumental && hasLyrics) body.lyrics = customLyrics!.trim()
  }

  const res = await fetch('https://api.minimax.io/v1/music_generation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    const err: Error & { code?: string } = new Error('지금 너무 많은 사람이 만들고 있어요. 잠시 후 다시 시도해 주세요')
    err.code = 'RATE_LIMITED'
    throw err
  }

  const data = await res.json()
  if (data.base_resp?.status_code !== 0) {
    throw new Error(translateMinimaxError(data.base_resp?.status_msg))
  }

  // 실제 재생 길이 — MiniMax는 extra_info.audio_length(ms)로 반환. 초로 반올림해 저장.
  const audioLenMs = (data.extra_info?.audio_length ?? data.data?.audio_length) as unknown
  const duration = typeof audioLenMs === 'number' && audioLenMs > 0 ? Math.round(audioLenMs / 1000) : null

  return { audioUrl: data.data.audio, lyrics: isInstrumental ? '' : (customLyrics || ''), duration }
}

const MOCK_COVER_URL = 'https://picsum.photos/seed/minimax/512/512'

export async function generateCoverImage(stylePrompt: string): Promise<string | null> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 1000))
    return MOCK_COVER_URL
  }

  // 고정 템플릿("Album cover art... cinematic, atmospheric")이 가사와 결합되면
  // 실루엣 포트레이트로 수렴하는 문제 발견. MiniMax `prompt_optimizer: true`가 이미
  // album cover 스타일 보강을 자동 수행하므로 사용자 컨텐츠(스타일·무드·가사)를
  // 그대로 흘려보내고 최소 prefix만 유지해 다양성 복구.
  const imagePrompt = `Album cover artwork: ${stylePrompt}`

  const res = await fetch('https://api.minimax.io/v1/image_generation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'image-01',
      prompt: imagePrompt.slice(0, 1500),
      aspect_ratio: '1:1',
      response_format: 'url',
      n: 1,
      prompt_optimizer: true,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  if (data.base_resp?.status_code !== 0) return null
  return data.data?.image_urls?.[0] ?? null
}

// 곡 맥락(장르·무드·제목·가사)을 이미지 생성용 "시각 프롬프트"로 번역하는 아트디렉터(LLM).
// 서사적 가사·제목을 그대로 image-01에 넣으면 맥락 없는 이미지가 나오던 문제를 개선.
// 실패/타임아웃/미설정이면 null → 호출부가 기존 로직으로 폴백(커버 생성 안 깨짐).
// 비용 ~ $0.0004/곡(MiniMax-M3). 지연은 곡 생성에 가려짐(병렬).
const COVER_ART_SYSTEM =
  'You are an album cover art director. From a song\'s genre, mood, title, and lyrics, write ONE vivid English prompt for an AI image model to create the album cover. Describe a concrete visual scene: subject, setting, composition, color palette, lighting, and art style/medium, all matching the song\'s emotion. Rules: purely visual (no music/audio words); include NO text, letters, words, numbers, or logos in the image; do NOT quote the lyrics; avoid generic clichés; 1-2 sentences, under 80 words. Output only the prompt, no preamble.'

export async function craftCoverPrompt(ctx: { genre?: string; mood?: string; title?: string; lyrics?: string }): Promise<string | null> {
  if (MOCK_MODE) return null
  const lyrics = (ctx.lyrics ?? '').replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
  const parts = [
    ctx.genre ? `Genre: ${ctx.genre}` : '',
    ctx.mood ? `Mood: ${ctx.mood}` : '',
    ctx.title ? `Title: ${ctx.title}` : '',
    lyrics ? `Lyrics: ${lyrics}` : '',
  ].filter(Boolean).join('\n')
  if (!parts) return null
  try {
    const res = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MINIMAX_TEXT_MODEL || 'MiniMax-M3',
        messages: [
          { role: 'system', content: COVER_ART_SYSTEM },
          { role: 'user', content: parts },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.base_resp?.status_code != null && data.base_resp.status_code !== 0) return null
    const out = data.choices?.[0]?.message?.content
    const text = typeof out === 'string' ? out.trim() : ''
    return text ? text.slice(0, 1200) : null
  } catch {
    return null
  }
}

export { MOCK_MODE }

// MiniMax 영문 에러 메시지 → 한국어 친화 메시지
function translateMinimaxError(raw: string | undefined): string {
  if (!raw) return '음악을 만드는 중 문제가 생겼어요'
  const s = raw.toLowerCase()
  if (s.includes('lyrics is too short')) return '가사가 너무 짧아요 (최소 10자 이상)'
  if (s.includes('lyrics is required')) return '이 모델은 가사가 꼭 필요해요. 가사를 입력하거나 Music 2.6을 사용해 주세요'
  if (s.includes('is_instrumental only supported')) return '이 모델은 인스트루멘탈을 지원하지 않아요'
  if (s.includes('rate limit') || s.includes('too many requests')) return '지금 너무 많은 사람이 만들고 있어요. 잠시 후 다시 시도해 주세요'
  if (s.includes('insufficient balance') || s.includes('credit')) return '서비스 크레딧이 부족해요. 관리자에게 문의해 주세요'
  if (s.includes('unauthorized') || s.includes('invalid api key')) return '서버 인증 문제가 생겼어요. 잠시 후 다시 시도해 주세요'
  if (s.includes('content policy') || s.includes('sensitive')) return '입력한 내용이 콘텐츠 정책에 맞지 않아요. 다른 표현으로 시도해 주세요'
  if (s.includes('timeout')) return '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요'
  return raw  // 매핑 안 된 건 원문 그대로 (디버깅용)
}
