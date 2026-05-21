export interface Song {
  id: string
  createdAt: string
  title: string | null
  prompt: string
  genre: string | null
  mood: string | null
  customLyrics: string | null
  lyrics: string | null
  instrumental: boolean
  audioUrl: string
  duration: number | null
  liked?: boolean
  coverImage?: string
  coverHue?: number
  isNew?: boolean
  published?: boolean
  publishedAt?: string
  publishComment?: string
  publishCoverImage?: string
}

export type Genre = '발라드' | '팝' | 'R&B' | '포크' | '힙합' | '재즈'
export type Mood = '잔잔한' | '신나는' | '감성적' | '몽환적' | '그리운'

export const GENRES: Genre[] = ['발라드', '팝', 'R&B', '포크', '힙합', '재즈']
export const MOODS: Mood[] = ['잔잔한', '신나는', '감성적', '몽환적', '그리운']

export interface PublicSong {
  id: string
  title: string | null
  prompt: string
  genre: string | null
  mood: string | null
  instrumental: boolean
  audioUrl: string
  coverHue: number
  coverImage?: string
  duration?: number | null
  lyrics: string | null
  createdAt: string
  username: string
  displayName: string
  userId: string
  likeCount: number
  playCount: number
  isLiked?: boolean
}

export interface UserProfile {
  username: string
  displayName: string
  userId: string
  bio: string | null
  avatarHue: number
  avatarImage?: string
  coverImage?: string
  followerCount: number
  followingCount: number
  songCount: number
  isFollowing?: boolean
}

export interface Collection {
  id: string
  name: string
  songIds: string[]
  coverImage?: string
  createdAt: string
}

export const EXAMPLE_PROMPTS = [
  '비 오는 날 카페에서 혼자 창밖을 바라봤어',
  '오랜 친구를 오랜만에 만나서 너무 반가웠어',
  '퇴근길에 노을이 너무 예뻐서 한참 바라봤어',
  '오늘 중요한 발표를 잘 마쳤어, 너무 뿌듯해',
  '갑자기 예전 생각이 나서 혼자 웃었어',
]
