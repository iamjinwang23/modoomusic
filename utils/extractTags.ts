// 곡 prompt/lyrics/title에서 장르·무드 키워드 추출 (규칙 기반)
// 사용자가 SongForm에서 명시 선택 안 한 경우 자동 채움. songService.save에서 호출.
// 추출 결과는 칩 필터(getAvailableTags)에서 그대로 노출됨.

// 키워드 사전 — 표시 라벨(한국어) → 매칭할 토큰 배열 (한·영 별칭 포함)
const GENRE_DICT: Record<string, string[]> = {
  '발라드':   ['발라드', 'ballad'],
  '팝':       ['팝송', 'pop', 'k-pop', 'kpop', 'city pop', 'citypop', 'synth-pop', 'synthpop'],
  'R&B':      ['r&b', 'rnb', 'rhythm and blues', '알앤비'],
  '힙합':     ['힙합', 'hip-hop', 'hiphop', 'hip hop', 'rap', '랩'],
  '재즈':     ['재즈', 'jazz', 'bossa', '보사노바'],
  '포크':     ['포크', 'folk', 'acoustic', '어쿠스틱'],
  '락':       ['락', '록', 'rock', '하드락', 'metal', '메탈'],
  '일렉트로닉': ['edm', 'electronic', '일렉트로닉', '하우스', 'house', 'techno', '테크노', 'trance'],
  '펑크':     ['funk', 'funky', '펑크'],
  '컨트리':   ['country', '컨트리'],
  '클래식':   ['classical', '클래식', '오케스트라', 'orchestra'],
  '로파이':   ['lo-fi', 'lofi', '로파이'],
}

const MOOD_DICT: Record<string, string[]> = {
  '잔잔한':   ['잔잔', 'chill', 'calm', '조용', 'mellow', '차분'],
  '신나는':   ['신나', '신난', 'upbeat', 'energetic', '에너제틱', '활기', '발랄', 'fun', 'dance'],
  '감성적':   ['감성', 'emotional', 'sentimental'],
  '몽환적':   ['몽환', 'dreamy', 'ethereal', '꿈'],
  '그리운':   ['그리운', '그리움', 'nostalgic', '추억', '향수'],
  '슬픈':     ['슬픈', '슬픔', 'sad', 'melancholy', '우울'],
  '밝은':     ['밝은', 'bright', 'happy', '행복', '즐거운'],
  '따뜻한':   ['따뜻', 'warm', 'cozy', '포근'],
  '로맨틱':   ['로맨틱', 'romantic', '사랑', 'love'],
  '강렬한':   ['강렬', 'intense', 'powerful', '파워', 'epic'],
  '쓸쓸한':   ['쓸쓸', 'lonely', '외로움', '외로운'],
}

function pickFirst(dict: Record<string, string[]>, haystack: string): string | null {
  const lower = haystack.toLowerCase()
  for (const [label, tokens] of Object.entries(dict)) {
    if (tokens.some((t) => lower.includes(t.toLowerCase()))) return label
  }
  return null
}

export function extractGenre(text: string): string | null {
  return pickFirst(GENRE_DICT, text)
}

export function extractMood(text: string): string | null {
  return pickFirst(MOOD_DICT, text)
}

// 곡 컨텍스트(prompt + lyrics + customLyrics + title) 합쳐서 한 번에 추출
export function inferTags(input: {
  prompt?: string | null
  title?: string | null
  lyrics?: string | null
  customLyrics?: string | null
}): { genre: string | null; mood: string | null } {
  const haystack = [input.prompt, input.title, input.lyrics, input.customLyrics]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join('\n')
  return {
    genre: extractGenre(haystack),
    mood:  extractMood(haystack),
  }
}
