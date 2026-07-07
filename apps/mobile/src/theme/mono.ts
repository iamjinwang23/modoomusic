// MONO 디자인 토큰 — 웹(Tailwind) 팔레트 이식. 모든 네이티브 화면/프리미티브의 단일 소스.
export const mono = {
  color: {
    bg: '#111318',           // 앱 배경
    surface: '#21252E',      // 카드/입력 표면
    surface2: '#282D38',     // 상승 표면(메뉴 등)
    surfaceAlt: '#252A35',
    accent: '#7c3aed',       // violet-600 (주 액센트)
    accentSoft: '#8b5cf6',   // violet-500
    accentLight: '#c4b5fd',  // violet-300
    text: '#ffffff',
    textSecondary: '#9ca3af', // zinc-400
    textTertiary: '#6b7280',  // zinc-500
    border: 'rgba(255,255,255,0.10)',
    borderSoft: 'rgba(255,255,255,0.06)',
    fill: 'rgba(255,255,255,0.06)',
    fillStrong: 'rgba(255,255,255,0.10)',
    danger: '#f87171',
    kakao: '#FEE500',
    kakaoText: '#191600',
    overlay: 'rgba(0,0,0,0.45)',      // 미디어 위 반투명(뒤로가기 버튼 등)
    overlayStrong: 'rgba(0,0,0,0.6)',  // 배지 등 대비 필요 시
    onMedia: '#ffffff',                // 이미지/영상 위 텍스트·아이콘
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },
  space: (n: number) => n * 4, // 4pt 그리드
  font: {
    title: 34,
    h1: 26,
    h2: 20,
    body: 15,
    small: 13,
    tiny: 11,
  },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
} as const

export type MonoColor = keyof typeof mono.color
