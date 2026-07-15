import { api } from './api'

export const VIDEO_TIERS = [
  { id: 'basic', label: '기본 (512P)', name: '기본', res: '512P', credits: 10 },
  { id: 'hd', label: '고화질 (768P)', name: '고화질', res: '768P', credits: 20 },
] as const

export type VideoTier = (typeof VIDEO_TIERS)[number]['id']

export interface VideoStatus {
  status: 'generating' | 'done' | 'failed' | null
  videoCoverUrl?: string | null
}

export type VideoMode = 'image_to_video' | 'text_to_video'

// 영상 커버 생성 — 이미지→영상(커버/교체 이미지 기반) 또는 텍스트→영상(장면 묘사). 크레딧 차감(basic10/hd20).
// 백그라운드 생성 → video_cover_status. 성공 응답에 즉시 URL은 없을 수 있음(폴링).
// imageData = image_to_video의 first frame 교체(data:image/... base64, 서버 4MB 제한). 없으면 곡 커버 사용.
export async function generateVideoCover(songId: string, opts: { mode: VideoMode; tier: VideoTier; motionPrompt?: string; textPrompt?: string; imageData?: string }) {
  return api.post(`/api/songs/${songId}/generate-video`, {
    mode: opts.mode,
    tier: opts.tier,
    motionPrompt: opts.mode === 'image_to_video' ? (opts.motionPrompt?.trim() || undefined) : undefined,
    textPrompt: opts.mode === 'text_to_video' ? (opts.textPrompt?.trim() || undefined) : undefined,
    imageData: opts.mode === 'image_to_video' ? opts.imageData : undefined,
  })
}

export async function getVideoStatus(songId: string): Promise<VideoStatus> {
  return api.get(`/api/songs/${songId}/video-status`) as Promise<VideoStatus>
}
