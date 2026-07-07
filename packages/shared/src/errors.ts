// API 라우트가 반환하는 에러코드 — 웹/앱 공용 매핑 소스
export const API_ERROR = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not_found',
  not_member: 'not_member',
  banned_word: 'banned_word',
  community_closing: 'community_closing',
  community_limit_reached: 'community_limit_reached',
  song_not_public: 'song_not_public',
  internal: 'internal',
} as const
export type ApiErrorCode = (typeof API_ERROR)[keyof typeof API_ERROR]
