// 곡·댓글 신고 클라이언트 service.
// 즉시 블라인드는 로컬 state(컴포넌트), 새로고침 후 list 필터는 getMy*ReportedIds().

import { createClient } from '@/lib/supabase/client'

export const REPORT_REASONS = [
  '욕설·비속어',
  '음란물',
  '혐오·차별 표현',
  '도배',
  '광고·홍보성 콘텐츠',
  '개인정보 노출',
  '저작권 침해',
  '기타',
] as const
export type ReportReason = typeof REPORT_REASONS[number]

export async function reportSong(songId: string, reason: ReportReason): Promise<void> {
  const res = await fetch(`/api/songs/${songId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 409) return  // 멱등 — 같은 곡 중복 신고는 성공 처리
    throw new Error(body?.error || '신고 접수에 실패했어요')
  }
}

// 새로고침 후 list 필터링용 — 본인이 신고한 곡 ID set.
// 어드민 '기각(dismissed)' 신고는 제외 — 어드민이 문제 없다고 판단했으므로 사용자에게 다시 보여줌.
export async function getMyReportedSongIds(): Promise<Set<string>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Set()
  const { data, error } = await supabase
    .from('song_reports')
    .select('song_id, resolved_at, resolution')
    .eq('reporter_id', user.id)
  if (error) {
    console.error('[reportService.getMyReportedSongIds]', error.message)
    return new Set()
  }
  return new Set(
    (data ?? [])
      .filter((r) => !r.resolved_at || r.resolution !== 'dismissed')
      .map((r) => r.song_id as string),
  )
}

// 댓글도 동일 패턴 — CommentsPanel에서 호출
export async function getMyReportedCommentIds(): Promise<Set<string>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Set()
  const { data, error } = await supabase
    .from('comment_reports')
    .select('comment_id, resolved_at, resolution')
    .eq('reporter_id', user.id)
  if (error) {
    console.error('[reportService.getMyReportedCommentIds]', error.message)
    return new Set()
  }
  return new Set(
    (data ?? [])
      .filter((r) => !r.resolved_at || r.resolution !== 'dismissed')
      .map((r) => r.comment_id as string),
  )
}
