import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event } from 'react-native-track-player'
import type { Song } from '@mono/shared'
import { setNowPlaying, type NowPlaying } from './now-playing'
import { myDisplayName } from './me'
import { api } from './api'

let ready = false
// 현재 큐의 곡별 도메인 데이터(가사·좋아요 등) — 활성 트랙 변경 시 now-playing 복원용
const queueMap = new Map<string, NowPlaying>()

// 재생수 — 세션 내 곡당 1회만(웹 GlobalPlayerContext.countedRef 파리티). 서버 RPC는 dedup 없어 클라가 게이트.
const countedPlays = new Set<string>()
function countPlay(id: string) {
  if (countedPlays.has(id)) return
  countedPlays.add(id)
  api.post(`/api/songs/${id}/play`).catch(() => {}) // fire-and-forget
}

// 생성 중 미리 듣기(웹 GlobalPlayerContext previewRef 파리티) — 부분 MP3 재생 중이면 세팅.
// 부분 파일 끝에 닿으면 최신 부분/완곡으로 이어붙기(체이스). null = 일반 재생.
let preview: { songId: string; url: string } | null = null
let chaseTimer: ReturnType<typeof setTimeout> | null = null
function clearPreview() {
  preview = null
  if (chaseTimer) { clearTimeout(chaseTimer); chaseTimer = null }
}

function toTrack(s: NowPlaying, myName: string | null) {
  return {
    id: s.id,
    url: s.audioUrl,
    title: s.title?.trim() || '제목 없음',
    // 공개곡=크리에이터 표시명 / 내 곡=내 표시명(폴백 '내 음악')
    artist: s.displayName?.trim() || myName || '내 음악',
    artwork: s.coverImage,
    duration: s.duration ?? undefined,
  }
}

// 단일 트랙 교체 로드 — 프리뷰 전환·완곡 스왑용. resumeAt 위치로 이어서 재생.
async function loadSingle(np: NowPlaying, resumeAt: number) {
  const myName = await myDisplayName()
  setNowPlaying(np)
  queueMap.clear()
  queueMap.set(np.id, np)
  await TrackPlayer.reset()
  await TrackPlayer.add([toTrack(np, myName)])
  if (resumeAt > 0.3) await TrackPlayer.seekTo(resumeAt)
  await TrackPlayer.play()
}

// 프리뷰 끝 도달 — 서버 최신 상태로 다음 소스 결정(더 긴 부분/완곡). 새 부분 없으면 3초 후 재시도.
async function chasePreview() {
  if (!preview) return
  const { songId, url } = preview
  try {
    // 재개 위치 — 끝난 부분 파일의 길이(position이 0으로 리셋되는 경우 duration 폴백)
    const { position, duration } = await TrackPlayer.getProgress()
    const resumeAt = Math.max(position, duration > 0.5 ? duration - 0.2 : 0)

    const j = (await api.get(`/api/songs/${songId}`)) as { song?: Song }
    const s = j.song
    if (!s || !preview || preview.songId !== songId) { clearPreview(); return }

    if (s.status === 'done' && s.audioUrl) {
      clearPreview()
      await loadSingle({
        id: s.id, title: s.title, audioUrl: s.audioUrl, coverImage: s.coverImage, coverHue: s.coverHue,
        duration: s.duration, lyrics: s.lyrics, liked: s.liked, published: s.published,
      }, resumeAt)
      return
    }
    if (s.status === 'generating' && s.previewAudioUrl && s.previewAudioUrl !== url) {
      preview = { songId, url: s.previewAudioUrl }
      const prevNp = queueMap.get(songId)
      await loadSingle({
        id: songId, title: s.title ?? prevNp?.title ?? null, audioUrl: s.previewAudioUrl,
        coverImage: s.coverImage ?? prevNp?.coverImage, coverHue: s.coverHue ?? prevNp?.coverHue, duration: null,
      }, resumeAt)
      return
    }
    if (s.status === 'generating') {
      chaseTimer = setTimeout(() => { chasePreview() }, 3000)
      return
    }
    clearPreview() // failed 등
  } catch {
    clearPreview()
  }
}

export async function setupPlayer() {
  if (ready) return
  try {
    await TrackPlayer.setupPlayer()
  } catch {
    // 이미 초기화된 경우 무시
  }
  await TrackPlayer.updateOptions({
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
    capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
  })
  // 이전/다음 곡 이동(락스크린·앱 내 버튼)으로 활성 트랙이 바뀌면 now-playing 화면 동기화 + 재생수 집계.
  // ActiveTrackChanged는 초기 재생·스킵 모두 발화 → 여기서 세션당 곡1회 카운트.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (e) => {
    const id = (e?.track as { id?: string } | undefined)?.id
    if (id && queueMap.has(id)) {
      setNowPlaying(queueMap.get(id)!)
      if (preview?.songId !== id) countPlay(id)  // 프리뷰(미완성)는 재생수 제외
    }
  })
  // 프리뷰 부분 파일 끝 — 체이스로 이어붙기
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (preview) chasePreview()
  })
  ready = true
}

// 곡 재생 — queue를 주면 목록 전체를 큐에 넣고 해당 곡부터 재생(이전/다음 곡 동작).
// queue 없으면 단일 곡.
export async function playSong(song: NowPlaying, queue?: NowPlaying[]) {
  if (!song.audioUrl) return
  clearPreview()
  const list = (queue && queue.length ? queue : [song]).filter((s) => s.audioUrl)
  const startIdx = Math.max(0, list.findIndex((s) => s.id === song.id))
  setNowPlaying(song)
  await setupPlayer()
  const myName = await myDisplayName()
  queueMap.clear()
  list.forEach((s) => queueMap.set(s.id, s))
  await TrackPlayer.reset()
  await TrackPlayer.add(list.map((s) => toTrack(s, myName)))
  if (startIdx > 0) await TrackPlayer.skip(startIdx)
  await TrackPlayer.play()
}

// 생성 중 미리 듣기 재생 — 부분 MP3 단일 트랙. 끝에 닿으면 자동으로 최신 부분/완곡으로 이어붙기.
export async function playPreviewSong(song: Song) {
  if (!song.previewAudioUrl) return
  clearPreview()
  await setupPlayer()
  preview = { songId: song.id, url: song.previewAudioUrl }
  await loadSingle({
    id: song.id, title: song.title, audioUrl: song.previewAudioUrl,
    coverImage: song.coverImage, coverHue: song.coverHue, duration: null,
  }, 0)
}
