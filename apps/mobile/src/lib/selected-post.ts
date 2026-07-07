import type { CommunityPost } from '@mono/shared'

// 선택 게시글 전달용 경량 스토어 — 단일 게시글 GET 엔드포인트가 없어서
// 피드에서 탭한 post 객체를 상세 화면으로 넘긴다. 딥링크로 바로 들어오면 null.
let selected: CommunityPost | null = null

export function setSelectedPost(p: CommunityPost | null) {
  selected = p
}

export function getSelectedPost(): CommunityPost | null {
  return selected
}
