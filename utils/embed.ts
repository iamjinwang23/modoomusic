// 링크 → 임베드 정보 파서. 화이트리스트 provider만 iframe/video로 임베드(보안).
export type EmbedProvider = 'youtube' | 'spotify' | 'apple-music' | 'soundcloud' | 'video'

export interface EmbedInfo {
  provider: EmbedProvider
  src: string
  kind: 'iframe' | 'video'
  aspect?: string   // 'iframe' 비디오형 (유튜브 등)
  height?: number   // 오디오 플레이어형 고정 높이 (스포티파이·애플·사클)
}

export function parseEmbed(input: string): EmbedInfo | null {
  const raw = input.trim()
  if (!raw) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\./, '')

  // YouTube · YouTube Music
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v')
    if (v) return { provider: 'youtube', src: `https://www.youtube.com/embed/${v}`, kind: 'iframe', aspect: '16/9' }
    const shorts = u.pathname.match(/^\/shorts\/([\w-]+)/)
    if (shorts) return { provider: 'youtube', src: `https://www.youtube.com/embed/${shorts[1]}`, kind: 'iframe', aspect: '9/16' }
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1)
    if (id) return { provider: 'youtube', src: `https://www.youtube.com/embed/${id}`, kind: 'iframe', aspect: '16/9' }
  }

  // Spotify
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)/)
    if (m) {
      const tall = m[1] === 'album' || m[1] === 'playlist' || m[1] === 'show' || m[1] === 'artist'
      return { provider: 'spotify', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, kind: 'iframe', height: tall ? 352 : 152 }
    }
  }

  // Apple Music
  if (host === 'music.apple.com' || host === 'embed.music.apple.com') {
    const isAlbumList = /\/(album|playlist)\//.test(u.pathname) && !u.searchParams.get('i')
    return { provider: 'apple-music', src: `https://embed.music.apple.com${u.pathname}${u.search}`, kind: 'iframe', height: isAlbumList ? 450 : 175 }
  }

  // SoundCloud
  if (host === 'soundcloud.com') {
    const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(raw)}&color=%23a855f7&auto_play=false&hide_related=true&show_comments=false&show_user=true`
    return { provider: 'soundcloud', src, kind: 'iframe', height: 166 }
  }

  // 직접 비디오 파일
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) {
    return { provider: 'video', src: raw, kind: 'video', aspect: '16/9' }
  }

  return null
}
