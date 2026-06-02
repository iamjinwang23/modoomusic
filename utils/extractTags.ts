// 곡 prompt/lyrics/title에서 장르·무드 키워드 추출 (규칙 기반)
// 사용자가 SongForm에서 명시 선택 안 한 경우 자동 채움. songService.save에서 호출.
// 추출 결과는 칩 필터(getAvailableTags)에서 그대로 노출됨.
//
// **장르 fallback**: 매칭 없으면 '기타' 부여 (null 아님). 모든 곡이 하나의 장르 라벨을 가짐.
// **사전 순서 중요**: pickFirst가 순서대로 첫 매치 반환 → 특화 라벨(K-pop, 로파이 등)을 일반(팝, 락 등)보다 먼저.

// 키워드 사전 — 표시 라벨(한국어) → 매칭할 토큰 배열 (한·영 별칭 포함)
const GENRE_DICT: Record<string, string[]> = {
  // 1) 특화·세부 장르 — substring 충돌 회피로 먼저
  'K-pop':      ['k-pop', 'kpop', '케이팝', '케이 팝'],
  '로파이':     ['로파이', 'lo-fi', 'lofi'],
  '트로트':     ['트로트', 'trot'],
  '레게':       ['레게', 'reggae'],
  '가스펠':     ['가스펠', 'gospel', '복음', 'ccm'],
  '라틴':       ['라틴', 'latin', 'salsa', '살사', 'reggaeton', '레게톤', 'bachata', '바차타'],
  '동요':       ['동요', '어린이 노래', '아이 노래', "children's song", 'kids song', 'nursery rhyme'],

  // 2) 일반 장르
  '발라드':     ['발라드', 'ballad'],
  '팝':         ['팝', '팝송', 'pop', 'city pop', 'citypop', 'synth-pop', 'synthpop'],
  'R&B':        ['알앤비', '소울', 'r&b', 'rnb', 'rhythm and blues', 'soul'],
  '힙합':       ['힙합', '랩', 'hip-hop', 'hiphop', 'hip hop', 'rap'],
  '재즈':       ['재즈', '보사노바', 'jazz', 'bossa'],
  '포크':       ['포크', '어쿠스틱', 'folk', 'acoustic'],
  '락':         ['락', '록', '하드락', '메탈', 'rock', 'hard rock', 'metal'],
  '일렉트로닉': ['일렉트로닉', '하우스', '테크노', '트랜스', '덥스텝', 'edm', 'electronic', 'house', 'techno', 'trance', 'dubstep'],
  '펑크':       ['펑크', 'funk', 'funky'],
  '디스코':     ['디스코', 'disco'],
  '컨트리':     ['컨트리', 'country'],
  '클래식':     ['클래식', '오케스트라', '교향곡', 'classical', 'orchestra', 'symphony'],
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

// 빈 사전 노출용 — getAvailableTags가 곡 0건 상태에서도 칩 후보 알 수 있게
export const GENRE_LABELS = Object.keys(GENRE_DICT).concat(['기타'])
export const MOOD_LABELS = Object.keys(MOOD_DICT)

function pickFirst(dict: Record<string, string[]>, haystack: string): string | null {
  const lower = haystack.toLowerCase()
  for (const [label, tokens] of Object.entries(dict)) {
    if (tokens.some((t) => lower.includes(t.toLowerCase()))) return label
  }
  return null
}

// 장르는 매칭 없으면 '기타' 부여 — 모든 곡이 라벨 하나는 가짐
export function extractGenre(text: string): string {
  return pickFirst(GENRE_DICT, text) ?? '기타'
}

// 무드는 매칭 없으면 null — 미세 감정이라 임의 fallback 안 줌
export function extractMood(text: string): string | null {
  return pickFirst(MOOD_DICT, text)
}

// 곡 컨텍스트(prompt + lyrics + customLyrics + title) 합쳐서 한 번에 추출
export function inferTags(input: {
  prompt?: string | null
  title?: string | null
  lyrics?: string | null
  customLyrics?: string | null
}): { genre: string; mood: string | null } {
  const haystack = [input.prompt, input.title, input.lyrics, input.customLyrics]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join('\n')
  return {
    genre: extractGenre(haystack),
    mood:  extractMood(haystack),
  }
}
