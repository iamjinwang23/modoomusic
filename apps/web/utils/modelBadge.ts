// 곡 모델 뱃지 — 2.6=바이올렛, 3.0=틸(teal-500 #14B8A6 기반)으로 구분. 2.0=기본이라 미표시.
// label(v2.6/v3.0)과 색상 Tailwind 클래스를 함께 반환. 표시 사이트(상세·카드·미니바 등) 공용.
export function modelBadgeInfo(model: string | null | undefined): { label: string; cls: string } | null {
  if (model === 'music-3.0') return { label: 'v3.0', cls: 'text-teal-300 bg-teal-500/20' }
  if (model === 'music-2.6') return { label: 'v2.6', cls: 'text-violet-300 bg-violet-600/20' }
  return null
}
