import Svg, { Defs, RadialGradient, LinearGradient, Stop, Rect } from 'react-native-svg'
import { mono } from '@/theme/mono'

// 둘러보기 상단 색감 워시 — 피드 상단 커버 hue 2~3개로 멀티 매시(라디얼 블롭 블렌드).
// 헤더 영역(fadeStart까지)은 불투명 다크 베이스로 스크롤 콘텐츠를 마스킹하고, 그 위에 틴트 블롭을 얹은 뒤
// 아래로 배경색까지 페이드해 피드로 이어짐(색이 콘텐츠 상단에 살짝 번짐 = 의도). 넷플릭스·YT뮤직 상단 틴트 느낌.
const SPOTS = [
  { cx: 0.16, cy: 0.0, rx: 0.62, ry: 0.52 },
  { cx: 0.9, cy: 0.08, rx: 0.6, ry: 0.5 },
  { cx: 0.52, cy: 0.22, rx: 0.58, ry: 0.5 },
]

export function HeaderMesh({ hues, width, height, fadeStart = 0.6 }: {
  hues: number[]
  width: number
  height: number
  fadeStart?: number  // 불투명 마스킹이 끝나고 페이드가 시작되는 지점(0~1). 보통 (titleH+chipsH)/height.
}) {
  const hs = (hues.length ? hues : [250]).slice(0, 3)
  const fs = Math.max(0.2, Math.min(0.9, fadeStart))
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        {hs.map((h, i) => (
          <RadialGradient key={i} id={`hm${i}`} cx={SPOTS[i].cx} cy={SPOTS[i].cy} rx={SPOTS[i].rx} ry={SPOTS[i].ry}>
            <Stop offset="0" stopColor={`hsl(${h}, 55%, 34%)`} stopOpacity={0.85} />
            <Stop offset="1" stopColor={`hsl(${h}, 55%, 34%)`} stopOpacity={0} />
          </RadialGradient>
        ))}
        {/* 다크 베이스: fadeStart까지 불투명(마스킹) → 하단 투명(콘텐츠 노출) */}
        <LinearGradient id="hmbase" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={mono.color.bg} stopOpacity={1} />
          <Stop offset={String(fs)} stopColor={mono.color.bg} stopOpacity={1} />
          <Stop offset="1" stopColor={mono.color.bg} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#hmbase)" />
      {hs.map((_, i) => (
        <Rect key={i} x="0" y="0" width={width} height={height} fill={`url(#hm${i})`} />
      ))}
    </Svg>
  )
}
