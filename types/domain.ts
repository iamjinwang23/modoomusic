export type SongStatus = 'generating' | 'done' | 'failed'

// Design Ref: video-cover §3 — 비디오 커버 (MiniMax Hailuo, 비동기)
export type VideoCoverStatus = 'generating' | 'done' | 'failed'
export type VideoCoverMode = 'image_to_video' | 'text_to_video'
export type VideoCoverTier = 'basic' | 'hd'  // basic=512P 10cr, hd=768P 20cr

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
  playCount?: number
  likeCount?: number
  commentCount?: number
  status?: SongStatus
  model?: string | null  // 'music-2.0' | 'music-2.5+' | 'music-2.6' (mig 029)
  // 비디오 커버 (mig 035)
  videoCoverUrl?: string
  videoCoverStatus?: VideoCoverStatus
  videoCoverMode?: VideoCoverMode
  videoCoverGeneratedAt?: string
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
  publishComment?: string
  publishCoverImage?: string
  published?: boolean
  createdAt: string
  username: string
  displayName: string
  userId: string
  avatarHue?: number
  avatarUrl?: string | null
  likeCount: number
  playCount: number
  commentCount: number
  isLiked?: boolean
  model?: string | null
  // 비디오 커버 (mig 035) — 공개 표면에서 자동재생 루프
  videoCoverUrl?: string
  videoCoverStatus?: VideoCoverStatus
}

// Design Ref: comments §3.3 — 댓글 + 작성자 메타 (단일 GET으로 top+replies)
export interface Comment {
  id: string
  songId: string
  userId: string
  parentId: string | null
  body: string
  likeCount: number
  liked: boolean              // 현재 사용자의 좋아요 여부 (서버에서 채움)
  createdAt: string
  editedAt: string | null
  user: {
    username: string
    displayName: string | null
    avatarUrl: string | null
    avatarHue: number | null
  }
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
  links?: SocialLinks
}

// Design Ref: notifications §3.2 — 알림 5종 + 행위자·곡 join 메타
export type NotificationType = 'like' | 'song_complete' | 'system' | 'follow' | 'comment' | 'credit_charged' | 'community_like' | 'community_comment'

export interface NotificationSystemPayload {
  title: string
  body: string
  url?: string
}

export interface Notification {
  id: string
  type: NotificationType
  actorId: string | null
  actorName: string | null
  actorAvatarUrl: string | null
  actorAvatarHue: number | null
  songId: string | null
  songTitle: string | null
  songCoverImage: string | null
  songCoverHue: number | null
  payload: NotificationSystemPayload | Record<string, unknown>
  readAt: string | null
  createdAt: string
}

// Design Ref: §5.2 Module 7 — 공지(What's New)
export type AnnouncementCategory = 'notice' | 'promotion' | 'feature'
export type AnnouncementStatus = 'published' | 'hidden'

export interface Announcement {
  id: string
  title: string
  category: AnnouncementCategory
  content: string          // 마크다운
  imageUrl: string | null
  status: AnnouncementStatus
  publishAt: string | null   // 예약 발행 시각 (null = 즉시)
  notifiedAt: string | null  // 전체 알림 발송 시각 (null = 미발송)
  popupEnabled: boolean      // 우측 하단 팝업 카드로 노출 (동시 1개만)
  popupStartsAt: string | null // 팝업 노출 시작 (null = 즉시)
  popupEndsAt: string | null   // 팝업 노출 종료 (null = 무기한)
  createdAt: string
  updatedAt: string
}

export const ANNOUNCEMENT_CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  notice: '공지',
  promotion: '프로모션',
  feature: '새로운 기능',
}

export interface SocialLinks {
  instagram?: string | null
  tiktok?: string | null
  youtube?: string | null
  facebook?: string | null
  x?: string | null
}

export interface Collection {
  id: string
  name: string
  songIds: string[]
  coverImage?: string
  createdAt: string
}

// Design Ref: recommended-creators §3.2 — 추천 크리에이터 카드용 가벼운 타입
export interface RecommendedCreator {
  id: string
  username: string
  displayName: string
  avatarHue: number
  avatarUrl: string | null
  followerCount: number
  /** 디버깅용 분기 표시 (1=개인화, 2=트렌딩, 3=신규). UI 표시 X */
  bucket?: 1 | 2 | 3
}

export const EXAMPLE_PROMPTS = [
  '비 오는 날 카페에서 혼자 창밖을 바라봤어',
  '오랜 친구를 오랜만에 만나서 너무 반가웠어',
  '퇴근길에 노을이 너무 예뻐서 한참 바라봤어',
  '오늘 중요한 발표를 잘 마쳤어, 너무 뿌듯해',
  '갑자기 예전 생각이 나서 혼자 웃었어',
]

// ── 커뮤니티(카페) ──────────────────────────────────────────
export interface Community {
  id: string
  managerId: string
  name: string
  topic: string | null
  description: string | null
  coverImage: string | null
  coverFocus: string | null    // 상세 배너 초점 (CSS object-position, 예: '50% 30%')
  avatarImage: string | null   // 대표(프로필) 이미지 — 타이틀 좌측 원형
  memberCount: number
  recentPostCount?: number  // 24시간 내 게시글 수
  createdAt: string
  isMember?: boolean   // 현재 유저 가입 여부 (목록/상세 표시용)
  isManager?: boolean  // 현재 유저가 매니저인지
}

export interface CommunityPost {
  id: string
  communityId: string
  authorId: string
  authorName: string | null
  authorUsername: string | null   // 프로필 이동용
  authorAvatarUrl: string | null
  authorAvatarHue: number | null
  content: string
  imageUrl: string | null        // legacy 단일 (미사용, 하위호환)
  imageUrls: string[]            // 첨부 이미지 (최대 10, webp)
  linkUrl: string | null         // 첨부 링크
  songId: string | null
  pinned: boolean
  likeCount: number
  commentCount: number
  liked?: boolean
  createdAt: string
  song?: { id: string; title: string | null; coverImage: string | null; coverHue: number | null; audioUrl: string | null; duration?: number | null } | null
  communityName?: string | null    // 인기글 등 전역 표면에서 어느 커뮤니티인지 표시
  communityAvatar?: string | null
  communityCover?: string | null   // 인기글 카드 썸네일 폴백
  poll?: CommunityPoll | null
}

// 투표 — 단일 선택, 게시 24h 후 종료
export interface CommunityPoll {
  options: string[]
  endsAt: string
  counts: number[]        // 옵션별 득표
  totalVotes: number
  myVote: number | null   // 내 선택 인덱스 (없으면 null)
}

export interface CommunityMember {
  userId: string
  displayName: string | null
  username: string | null
  avatarUrl: string | null
  avatarHue: number | null
  joinedAt: string
}

export interface CommunityPostComment {
  id: string
  postId: string
  parentId: string | null
  authorId: string
  body: string
  createdAt: string
  editedAt: string | null
  likeCount: number
  liked: boolean
  user: { username: string; displayName: string | null; avatarUrl: string | null; avatarHue: number | null }
  replies?: CommunityPostComment[]
}
