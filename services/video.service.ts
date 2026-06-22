// Design Ref: video-cover §4.2 — MiniMax Hailuo 영상 생성 래퍼 (비동기 task)
// 음악(동기)과 달리 영상은 비동기: createVideoTask→task_id → queryVideoTask(status)
//   → retrieveFileUrl(file_id)→download_url. 폴링은 호출측(상태 라우트/크론)이 담당.
// ⚠️ model 식별자는 MiniMax 콘솔/문서 기준으로 확인 필요(TIERS에 분리). 단가: video-cover.plan §갱신.
import type { VideoCoverMode, VideoCoverTier } from '@/types/domain'

const MOCK_MODE = process.env.MINIMAX_MOCK === 'true' || !process.env.MINIMAX_API_KEY
const API = 'https://api.minimax.io/v1'

// 2티어: basic=512P(10cr) / hd=768P(20cr). model 문자열은 콘솔 확인 후 조정.
export const VIDEO_TIERS: Record<VideoCoverTier, { model: string; resolution: string; credits: number; label: string }> = {
  basic: { model: 'MiniMax-Hailuo-02',       resolution: '512P', credits: 10, label: '기본 (512P)' },
  hd:    { model: 'MiniMax-Hailuo-2.3-Fast', resolution: '768P', credits: 20, label: '고화질 (768P)' },
}

export type VideoTaskStatus = 'Queueing' | 'Preparing' | 'Processing' | 'Success' | 'Fail'

function headers() {
  return { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json' }
}

function rateLimited(): Error & { code?: string } {
  const e: Error & { code?: string } = new Error('지금 영상 생성 요청이 많아요. 잠시 후 다시 시도해 주세요')
  e.code = 'RATE_LIMITED'
  return e
}

// 1) 생성 작업 요청 → task_id 반환
export async function createVideoTask(params: {
  mode: VideoCoverMode
  tier: VideoCoverTier
  prompt?: string
  imageUrl?: string  // image_to_video 모드의 first frame
}): Promise<string> {
  const { mode, tier, prompt, imageUrl } = params
  const t = VIDEO_TIERS[tier]
  if (MOCK_MODE) return `mock-task-${Date.now()}`

  const body: Record<string, unknown> = {
    model: t.model,
    duration: 6,
    resolution: t.resolution,
  }
  if (prompt) body.prompt = prompt
  if (mode === 'image_to_video' && imageUrl) body.first_frame_image = imageUrl

  const res = await fetch(`${API}/video_generation`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  if (res.status === 429) throw rateLimited()
  const data = await res.json()
  if (data.base_resp?.status_code !== 0 || !data.task_id) {
    throw new Error(translateVideoError(data.base_resp?.status_msg))
  }
  return data.task_id as string
}

// 2) 작업 상태 조회 → status (+ 완료 시 fileId)
export async function queryVideoTask(taskId: string): Promise<{ status: VideoTaskStatus; fileId?: string }> {
  if (MOCK_MODE) return { status: 'Success', fileId: 'mock-file' }
  const res = await fetch(`${API}/query/video_generation?task_id=${encodeURIComponent(taskId)}`, { headers: headers() })
  const data = await res.json()
  if (data.base_resp?.status_code !== 0) {
    throw new Error(translateVideoError(data.base_resp?.status_msg))
  }
  return { status: data.status as VideoTaskStatus, fileId: data.file_id ? String(data.file_id) : undefined }
}

// 3) file_id → 다운로드 URL
export async function retrieveFileUrl(fileId: string): Promise<string | null> {
  if (MOCK_MODE) return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  // 일부 환경은 GroupId 필요 → env로 선택 지원
  const gid = process.env.MINIMAX_GROUP_ID ? `&GroupId=${encodeURIComponent(process.env.MINIMAX_GROUP_ID)}` : ''
  const res = await fetch(`${API}/files/retrieve?file_id=${encodeURIComponent(fileId)}${gid}`, { headers: headers() })
  const data = await res.json()
  if (data.base_resp?.status_code !== 0) return null
  return data.file?.download_url ?? null
}

export function isTerminalStatus(s: VideoTaskStatus): boolean {
  return s === 'Success' || s === 'Fail'
}

export { MOCK_MODE as VIDEO_MOCK_MODE }

function translateVideoError(raw: string | undefined): string {
  if (!raw) return '영상을 만드는 중 문제가 생겼어요'
  const s = raw.toLowerCase()
  if (s.includes('rate limit')) return '지금 영상 생성 요청이 많아요. 잠시 후 다시 시도해 주세요'
  if (s.includes('insufficient') || s.includes('balance')) return '영상 생성 한도가 일시적으로 초과됐어요. 잠시 후 다시 시도해 주세요'
  if (s.includes('sensitive') || s.includes('risk')) return '입력에 민감한 내용이 포함되어 영상을 만들 수 없어요'
  if (s.includes('image')) return '커버 이미지를 영상으로 변환할 수 없어요. 다른 곡으로 시도해 주세요'
  return '영상을 만드는 중 문제가 생겼어요'
}
