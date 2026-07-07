// 곡 공유용 URL 생성 — 받는 사람이 클릭하면 해당 곡 상세가 열리도록.
// /song/{id} 전용 라우트로 진입 → 서버에서 곡별 OG 메타 동적 생성(카톡·페북 미리보기 곡 커버·제목) →
// 클라이언트는 마운트 즉시 /?song={id}로 redirect (SPA 진입 + shell이 곡 상세 오버레이 노출).
export function buildSongShareUrl(songId: string): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/song/${songId}`
}
