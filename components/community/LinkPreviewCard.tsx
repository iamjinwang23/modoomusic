'use client'
// 일반 링크 OG 프리뷰 카드 — 이미지 + 제목 + 도메인. 실패/로딩 시 링크 칩 폴백.
import { useEffect, useState } from 'react'
import Image from 'next/image'

interface OG { title: string | null; image: string | null; siteName: string | null; domain: string }

export function LinkPreviewCard({ url }: { url: string }) {
  const [data, setData] = useState<OG | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/og?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { if (d && !d.error && (d.title || d.image)) setData(d); setDone(true) } })
      .catch(() => { if (!cancelled) setDone(true) })
    return () => { cancelled = true }
  }, [url])

  let domain = ''
  try { domain = new URL(url).hostname.replace(/^www\./, '') } catch {}

  // 로딩/실패 → 링크 칩 폴백
  if (!data) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        className="mt-2.5 flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition">
        <Image src="/External-Link.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
        <span className="text-xs text-zinc-300 truncate">{done ? (domain || url) : url}</span>
      </a>
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className="mt-2.5 block rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition">
      {data.image && (
        <div className="relative aspect-[1.91/1] bg-black/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.image} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="px-3 py-2.5">
        <p className="text-[11px] text-zinc-500 truncate">{data.siteName || data.domain}</p>
        <p className="text-sm text-white truncate mt-0.5 leading-snug">{data.title || data.domain}</p>
      </div>
    </a>
  )
}
