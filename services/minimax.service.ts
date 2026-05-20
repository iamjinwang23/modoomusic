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

interface GenerateParams {
  prompt: string
  genre?: string
  mood?: string
  customLyrics?: string
  instrumental?: boolean
}

interface GenerateResult {
  audioUrl: string
  lyrics: string
}

export async function generateSong(params: GenerateParams): Promise<GenerateResult> {
  const { prompt, genre, mood, customLyrics, instrumental = false } = params

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 3000))
    return {
      audioUrl: MOCK_AUDIO_URL,
      lyrics: instrumental ? '' : (customLyrics || MOCK_LYRICS),
    }
  }

  const styleTag = [genre, mood].filter(Boolean).join(', ')
  const fullPrompt = styleTag ? `${styleTag}. ${prompt}` : prompt

  const body: Record<string, unknown> = {
    model: 'music-2.6-free',
    prompt: fullPrompt,
    is_instrumental: instrumental,
    output_format: 'url',
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
  }

  if (!instrumental) {
    if (customLyrics?.trim()) {
      body.lyrics = customLyrics.trim()
    } else {
      body.lyrics_optimizer = true
    }
  }

  const res = await fetch('https://api.minimax.io/v1/music_generation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg ?? 'MiniMax API 오류')
  }

  return { audioUrl: data.data.audio, lyrics: customLyrics || '' }
}

export { MOCK_MODE }
