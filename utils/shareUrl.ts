// 곡 공유용 URL 생성 — 받는 사람이 클릭하면 해당 곡 상세가 열리도록
// ?song={id} 쿼리 파라미터를 사용. shell layout이 이 파라미터를 읽어
// 자동으로 곡 상세 오버레이를 띄움.
export function buildSongShareUrl(songId: string): string {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.origin)
  url.searchParams.set('song', songId)
  return url.toString()
}
