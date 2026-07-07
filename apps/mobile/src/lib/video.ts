import { api } from './api'

export const VIDEO_TIERS = [
  { id: 'basic', label: '기본 (512P)', credits: 10 },
  { id: 'hd', label: '고화질 (768P)', credits: 20 },
] as const

export type VideoTier = (typeof VIDEO_TIERS)[number]['id']

export interface VideoStatus {
  status: 'generating' | 'done' | 'failed' | null
  videoCoverUrl?: string | null
}

// 영상 커버 생성 — 곡 커버 이미지 기반(image_to_video). 크레딧 차감(basic10/hd20).
// 백그라운드 생성 → video_cover_status. 성공 응답에 즉시 URL은 없을 수 있음(폴링).
export async function generateVideoCover(songId: string, opts: { tier: VideoTier; motionPrompt?: string }) {
  return api.post(`/api/songs/${songId}/generate-video`, {
    mode: 'image_to_video',
    tier: opts.tier,
    motionPrompt: opts.motionPrompt?.trim() || undefined,
  })
}

export async function getVideoStatus(songId: string): Promise<VideoStatus> {
  return api.get(`/api/songs/${songId}/video-status`) as Promise<VideoStatus>
}
