'use client'
// 링크 렌더 — 화이트리스트 provider면 플레이어 임베드, 그 외엔 OG 프리뷰 카드.
import { parseEmbed } from '@/utils/embed'
import { LinkPreviewCard } from '@/components/community/LinkPreviewCard'

export function PostEmbed({ url }: { url: string }) {
  const e = parseEmbed(url)

  // 임베드 불가 링크 → OG 프리뷰 카드
  if (!e) return <LinkPreviewCard url={url} />

  if (e.kind === 'video') {
    return (
      <div className="mt-2.5 rounded-xl overflow-hidden bg-black" style={{ aspectRatio: e.aspect ?? '16/9' }}>
        <video src={e.src} controls preload="metadata" className="w-full h-full" />
      </div>
    )
  }

  // iframe — 비디오형(aspect) vs 오디오형(고정 height)
  const wrapperStyle = e.aspect ? { aspectRatio: e.aspect } : { height: e.height ?? 152 }
  return (
    <div className="mt-2.5 rounded-xl overflow-hidden bg-black/20" style={wrapperStyle} onClick={(ev) => ev.stopPropagation()}>
      <iframe
        src={e.src}
        loading="lazy"
        allow="autoplay; encrypted-media; fullscreen; clipboard-write; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
      />
    </div>
  )
}
