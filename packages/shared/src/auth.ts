// Authorization 헤더에서 Bearer 토큰 추출 (RN 앱 경로). 없으면 null → 쿠키 경로로 위임.
// Headers / Next ReadonlyHeaders 둘 다 받도록 최소 인터페이스로 타입.
export function resolveAuthToken(headers: { get(name: string): string | null }): string | null {
  const auth = headers.get('authorization')
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim() || null
  return null
}
