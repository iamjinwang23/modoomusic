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

export const MODELS = [
  { id: 'music-2.0',        label: 'Music 2.0',         desc: '안정적인 기본 모델, 저렴한 비용',   locked: false, cover: false, credits: 2  },
  { id: 'music-2.6-free',   label: 'Music 2.6 (beta)', desc: '최신 MiniMax 모델, 풍부한 사운드',  locked: true,  cover: false, credits: 10 },
  { id: 'music-cover-free', label: 'Music Cover',       desc: '참조 음원 스타일로 커버 생성',      locked: true,  cover: true,  credits: 10 },
  { id: 'music-2.6',        label: 'Music 2.6 Pro',     desc: '준비 중',                          locked: true,  cover: false, credits: 10 },
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
}

export async function generateSong(params: GenerateParams): Promise<GenerateResult> {
  const { prompt, genre, mood, customLyrics, instrumental = false, model = 'music-2.6-free', audioBase64 } = params

  const isCoverModel = MODELS.find((m) => m.id === model)?.cover ?? false
  const hasLyrics = !!customLyrics?.trim()
  const isInstrumental = !isCoverModel && (instrumental || !hasLyrics)

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 3000))
    return {
      audioUrl: MOCK_AUDIO_URL,
      lyrics: isInstrumental ? '' : (customLyrics ?? ''),
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

  if (isCoverModel) {
    if (audioBase64) body.audio_base64 = audioBase64
    if (hasLyrics) body.lyrics = customLyrics!.trim()
  } else {
    body.is_instrumental = isInstrumental
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
    throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도하거나 Music 2.0 모델을 사용해보세요.')
  }

  const data = await res.json()
  if (data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg ?? 'MiniMax API 오류')
  }

  return { audioUrl: data.data.audio, lyrics: isInstrumental ? '' : (customLyrics || '') }
}

const MOCK_COVER_URL = 'https://picsum.photos/seed/minimax/512/512'

export async function generateCoverImage(stylePrompt: string): Promise<string | null> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 1000))
    return MOCK_COVER_URL
  }

  const imagePrompt = `Album cover art. ${stylePrompt}. Digital art, high quality, music album artwork, cinematic, atmospheric.`

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

export { MOCK_MODE }
