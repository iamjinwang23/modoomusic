// songs row ↔ Song 순수 매핑 (client song.service·서버 route 공용). 클라이언트 전용 의존 없음.
import type { Song, SongStatus } from '@mono/shared'

export interface DbSong {
  id: string
  user_id: string
  title: string | null
  prompt: string
  genre: string | null
  mood: string | null
  custom_lyrics: string | null
  lyrics: string | null
  instrumental: boolean
  audio_url: string | null
  duration: number | null
  liked: boolean
  cover_image: string | null
  cover_hue: number | null
  is_new: boolean
  is_public: boolean
  published_at: string | null
  publish_comment: string | null
  publish_cover_image: string | null
  created_at: string
  play_count: number
  like_count: number
  comment_count: number
  status: SongStatus | null
  model: string | null
  video_cover_url: string | null
  video_cover_status: string | null
  video_cover_mode: string | null
  video_cover_generated_at: string | null
}

export function rowToSong(r: DbSong): Song {
  return {
    id: r.id,
    createdAt: r.created_at,
    title: r.title,
    prompt: r.prompt,
    genre: r.genre,
    mood: r.mood,
    customLyrics: r.custom_lyrics,
    lyrics: r.lyrics,
    instrumental: r.instrumental,
    audioUrl: r.audio_url ?? '',
    duration: r.duration,
    liked: r.liked,
    coverImage: r.cover_image ?? undefined,
    coverHue: r.cover_hue ?? undefined,
    isNew: r.is_new,
    published: r.is_public,
    publishedAt: r.published_at ?? undefined,
    publishComment: r.publish_comment ?? undefined,
    publishCoverImage: r.publish_cover_image ?? undefined,
    playCount: r.play_count ?? 0,
    likeCount: r.like_count ?? 0,
    commentCount: r.comment_count ?? 0,
    status: r.status ?? 'done',
    model: r.model ?? null,
    videoCoverUrl: r.video_cover_url ?? undefined,
    videoCoverStatus: (r.video_cover_status as Song['videoCoverStatus']) ?? undefined,
    videoCoverMode: (r.video_cover_mode as Song['videoCoverMode']) ?? undefined,
    videoCoverGeneratedAt: r.video_cover_generated_at ?? undefined,
  }
}
