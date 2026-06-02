// Design Ref: comments §4.2 — 댓글 API 클라이언트 래퍼.
// 인증·알림 INSERT는 서버 라우트에서 처리, 여기는 fetch만.
import type { Comment } from '@/types/domain'

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string')
      ? (data as { error: string }).error
      : '요청에 실패했어요'
    const err = new Error(message) as Error & { status?: number; code?: string }
    err.status = res.status
    if (data && typeof data === 'object' && 'code' in data && typeof (data as { code?: unknown }).code === 'string') {
      err.code = (data as { code: string }).code
    }
    throw err
  }
  return data as T
}

export const commentService = {
  async listForSong(songId: string): Promise<Comment[]> {
    const res = await fetch(`/api/songs/${songId}/comments`)
    const data = await jsonOrThrow<{ comments: Comment[] }>(res)
    return data.comments
  },

  async create(songId: string, body: string): Promise<Comment> {
    const res = await fetch(`/api/songs/${songId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const data = await jsonOrThrow<{ comment: Comment }>(res)
    return data.comment
  },

  async reply(parentId: string, body: string): Promise<Comment> {
    const res = await fetch(`/api/comments/${parentId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const data = await jsonOrThrow<{ comment: Comment }>(res)
    return data.comment
  },

  async update(id: string, body: string): Promise<Comment> {
    const res = await fetch(`/api/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const data = await jsonOrThrow<{ comment: Comment }>(res)
    return data.comment
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' })
    await jsonOrThrow<{ ok: true }>(res)
  },

  // POST 단일 엔드포인트로 토글 (서버가 있으면 unlike, 없으면 like)
  async toggleLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
    const res = await fetch(`/api/comments/${id}/like`, { method: 'POST' })
    return jsonOrThrow<{ liked: boolean; likeCount: number }>(res)
  },

  async report(id: string, reason: string): Promise<void> {
    const res = await fetch(`/api/comments/${id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    await jsonOrThrow<{ ok: true }>(res)
  },
}

// 한국어 상대 시간 — "방금", "n분 전", "n시간 전", "n일 전", "n주 전", "n개월 전", "n년 전"
export function formatRelativeKo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 0) return '방금'
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '방금'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}주 전`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}개월 전`
  const yr = Math.floor(day / 365)
  return `${yr}년 전`
}

export const COMMENT_REPORT_REASONS = [
  '욕설·비속어',
  '음란물',
  '혐오·차별 표현',
  '도배',
  '광고·홍보성 콘텐츠',
  '개인정보 노출',
  '저작권 침해',
  '기타',
] as const
export type CommentReportReason = typeof COMMENT_REPORT_REASONS[number]
