// Design Ref: video-cover §7.2 — 비디오 커버 플레이어 (3단 폴백: video → image → gradient)
// 비디오 URL 있으면 자동재생 루프(muted playsinline), 없으면 정적 이미지, 그도 없으면 그라데이션.
import Image from 'next/image'

interface Props {
  videoCoverUrl?: string
  fallbackImageUrl?: string
  gradient?: string          // 둘 다 없을 때 배경 그라데이션 (예: coverGradient(song))
  className?: string
  rounded?: string           // 추가 라운드 클래스
  sizes?: string
}

export function VideoCoverPlayer({ videoCoverUrl, fallbackImageUrl, gradient, className = '', rounded = '', sizes }: Props) {
  if (videoCoverUrl) {
    return (
      <video
        src={videoCoverUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className={`w-full h-full object-cover ${rounded} ${className}`}
      />
    )
  }
  if (fallbackImageUrl) {
    return <Image src={fallbackImageUrl} alt="" fill unoptimized className={`object-cover ${className}`} sizes={sizes} />
  }
  return <div className={`w-full h-full ${rounded} ${className}`} style={gradient ? { background: gradient } : undefined} />
}
