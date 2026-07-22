import type { Song } from '@mono/shared'
import { api } from './api'
import { supabase } from './supabase'

// 음악 생성 모델 — 웹 minimax.service MODELS와 동기화(id/label/credits).
export const MUSIC_MODELS = [
  { id: 'music-3.0', label: 'Music 3.0', desc: '가장 자연스럽고 완성도 높은 최신 모델', credits: 10 },
  { id: 'music-2.6', label: 'Music 2.6', desc: '다른 곡을 참고해 만들 수 있어요', credits: 10 },
  { id: 'music-2.0', label: 'Music 2.0', desc: '빠르고 가볍게 만들 수 있어요', credits: 2 },
] as const

export type MusicModelId = (typeof MUSIC_MODELS)[number]['id']

export interface GenerateInput {
  prompt: string
  title?: string
  customLyrics?: string
  instrumental?: boolean
  autoLyrics?: boolean
  model: MusicModelId
  audioBase64?: string   // v2.6 스타일 참조 음원(cover 모드) — 서버가 audio_base64로 MiniMax 전달
}

export interface GenerateResult {
  song: Song
  credits?: { remaining: number }
}

// 생성 요청 — status=generating song을 즉시 반환. 백그라운드에서 done/failed 전환.
export async function generateSong(input: GenerateInput): Promise<GenerateResult> {
  return api.post('/api/generate', input)
}

// 내 songs UPDATE 실시간 구독 — generating→done/failed 전환 콜백.
// 반환한 함수를 호출하면 구독 해제. (웹 SongRealtimeBridge 패턴)
// 채널 토픽에 시퀀스를 붙여 매번 고유화 — dev StrictMode 이중 마운트나 재구독 시
// supabase가 동일 토픽의 (이미 subscribe된) 채널을 재사용해 `.on()`이 거부되는 문제 방지.
let channelSeq = 0
export function subscribeSongUpdates(userId: string, onChange: (row: { id: string; status: string | null }) => void) {
  const channel = supabase
    .channel(`songs:user:${userId}:${++channelSeq}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'songs', filter: `user_id=eq.${userId}` },
      (payload) => {
        const next = payload.new as { id?: string; status?: string | null }
        if (next?.id) onChange({ id: next.id, status: next.status ?? null })
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
