// 사용자 기본 프로필 색상 — 헤더·프로필·곡 상세 등 모든 곳에서 동일하게 사용
// 입력은 profiles.avatar_hue (DB 저장값). 6색 팔레트 인덱스 매핑.

export const PROFILE_PALETTE: { bg: string; text: string }[] = [
  { bg: 'hsl(87,57%,73%)',  text: 'hsl(87,45%,32%)'  },
  { bg: 'hsl(261,76%,75%)', text: 'hsl(261,55%,35%)' },
  { bg: 'hsl(40,60%,82%)',  text: 'hsl(40,50%,35%)'  },
  { bg: 'hsl(129,33%,77%)', text: 'hsl(129,30%,30%)' },
  { bg: 'hsl(0,49%,80%)',   text: 'hsl(0,40%,35%)'   },
  { bg: 'hsl(22,73%,75%)',  text: 'hsl(22,55%,35%)'  },
]

// hue (0~360) 또는 임의 양수를 받아 6색 중 하나로 매핑
export function profileColor(hue: number | null | undefined) {
  const n = typeof hue === 'number' && hue >= 0 ? Math.floor(hue) : 0
  return PROFILE_PALETTE[n % PROFILE_PALETTE.length]
}
