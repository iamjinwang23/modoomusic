// GET /api/og?url= — 링크 OG 메타(제목·이미지·도메인) 조회. 링크 프리뷰 카드용.
import { NextRequest, NextResponse } from 'next/server'

// 기본적인 SSRF 방어 — 사설/로컬 호스트 차단
function isBlockedHost(host: string): boolean {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/.test(host) || host.endsWith('.local') || host.endsWith('.internal')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/gi, "'").replace(/&nbsp;/g, ' ')
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return NextResponse.json({ error: 'no_url' }, { status: 400 })
  let target: URL
  try { target = new URL(raw) } catch { return NextResponse.json({ error: 'invalid' }, { status: 400 }) }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return NextResponse.json({ error: 'invalid' }, { status: 400 })
  if (isBlockedHost(target.hostname)) return NextResponse.json({ error: 'blocked' }, { status: 400 })

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(target.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MONO-LinkPreview/1.0; +https://modoonorae.com)', Accept: 'text/html,*/*' },
    })
    clearTimeout(timer)
    const ct = res.headers.get('content-type') ?? ''
    if (!res.ok || !ct.includes('text/html')) return NextResponse.json({ error: 'no_html' })
    const html = (await res.text()).slice(0, 300000)   // 상단 ~300KB만

    const meta = (key: string): string | null => {
      const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*\\scontent=["']([^"']*)["']`, 'i'))
      const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'))
      const v = a?.[1] ?? b?.[1]
      return v ? decodeEntities(v) : null
    }

    const title = meta('og:title') ?? meta('twitter:title') ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : null)
    const image = meta('og:image') ?? meta('og:image:url') ?? meta('twitter:image') ?? meta('twitter:image:src')
    const description = meta('og:description') ?? meta('twitter:description') ?? meta('description')
    const siteName = meta('og:site_name')

    return NextResponse.json(
      {
        url: target.toString(),
        title: title?.trim() || null,
        description: description?.trim() || null,
        image: image ? new URL(image, target).toString() : null,
        siteName: siteName?.trim() || null,
        domain: target.hostname.replace(/^www\./, ''),
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
    )
  } catch {
    return NextResponse.json({ error: 'fetch_failed' })
  }
}
