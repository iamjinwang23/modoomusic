import type { StyleProp, ViewStyle } from 'react-native'
import { mono } from '@/theme/mono'
// 웹과 동일한 MingCute 아이콘(웹 public의 그 SVG 에셋). fill을 currentColor로 치환해 color prop으로 tint.
import ThumbUp from '@/assets/mingcute/Thumb-Up.svg'
import Chat from '@/assets/mingcute/chat.svg'
import Share from '@/assets/mingcute/Share.svg'
import Notification from '@/assets/mingcute/Notification.svg'
import SearchSvg from '@/assets/mingcute/Search.svg'
import PlaySvg from '@/assets/mingcute/Play.svg'
import PauseSvg from '@/assets/mingcute/Pause.svg'
import More from '@/assets/mingcute/More.svg'
import Movie from '@/assets/mingcute/Movie.svg'
import MusicSvg from '@/assets/mingcute/Music.svg'
import GlobeSvg from '@/assets/mingcute/globe.svg'
import Add from '@/assets/mingcute/Add.svg'
import CloseFill from '@/assets/mingcute/Close-Fill.svg'
import LeftSmall from '@/assets/mingcute/Left-Small.svg'
import DownSmall from '@/assets/mingcute/Down-Small.svg'
import ArrowDown from '@/assets/mingcute/Arrow-To-Down.svg'
import SkipPrevious from '@/assets/mingcute/Skip-Previous.svg'
import SkipForward from '@/assets/mingcute/Skip-Forward.svg'
import Profile from '@/assets/mingcute/Profile.svg'
import Refresh from '@/assets/mingcute/Refresh.svg'
import Sparkles from '@/assets/mingcute/Sparkles.svg'
import AiGenerateText from '@/assets/mingcute/Ai-Generate-Text.svg'
import FileMusic from '@/assets/mingcute/File-Music.svg'
import Publish from '@/assets/mingcute/Publish.svg'
import LeftLine from '@/assets/mingcute/Left-Line.svg'
import Follow from '@/assets/mingcute/Follow.svg'
import Following from '@/assets/mingcute/Following.svg'
import PinSvg from '@/assets/mingcute/Pin.svg'
import PhotoAlbum from '@/assets/mingcute/Photo-Album.svg'
import PollSvg from '@/assets/mingcute/Poll.svg'
import EditSvg from '@/assets/mingcute/Edit.svg'
import Delete2 from '@/assets/mingcute/Delete-2.svg'
import Collection from '@/assets/mingcute/Collection.svg'
import Flag from '@/assets/mingcute/Flag.svg'
import Document from '@/assets/mingcute/Document.svg'
import Question from '@/assets/mingcute/Question.svg'
import ExternalLink from '@/assets/mingcute/External-Link.svg'
import Fullscreen from '@/assets/mingcute/Fullscreen.svg'

// 앱 아이콘 이름 → MingCute 컴포넌트. (좋아요=Thumb-Up 썸즈업, 웹과 동일)
const MAP = {
  bell: Notification,
  'line.3.horizontal': Profile,   // 라이브러리 헤더 프로필 진입
  plus: Add,
  ellipsis: More,
  'play.fill': PlaySvg,
  'pause.fill': PauseSvg,
  'chevron.down': DownSmall,     // 플레이어 내리기(minimize) — 다운로드 아이콘 아님
  download: ArrowDown,           // 실제 다운로드(곡 더보기)
  'chevron.left': LeftSmall,
  'gobackward.10': SkipPrevious,
  'goforward.10': SkipForward,
  magnifyingglass: SearchSvg,
  heart: ThumbUp,        // 좋아요 = 썸즈업(웹 Thumb-Up)
  'heart.fill': ThumbUp,
  globe: GlobeSvg,
  lock: GlobeSvg,
  'square.and.arrow.up': Share,
  film: Movie,
  'bubble.left': Chat,
  'music.note': MusicSvg,
  close: CloseFill,
  refresh: Refresh,              // 스타일 칩 다시 섞기(웹 Refresh)
  sparkle: Sparkles,             // 크레딧·CTA(웹 Sparkles)
  'ai.lyrics': AiGenerateText,   // AI 가사(웹 Ai-Generate-Text)
  'music.file': FileMusic,       // 곡 제목(웹 File-Music)
  compass: Publish,              // 공개(둘러보기 노출) — 웹 Publish/compass
  'arrow.left': LeftLine,        // 뒤로가기 화살표(웹 left-Line) — Left-Small(삼각형) 아님
  follow: Follow,                // 팔로우(웹 Follow=User-Add)
  following: Following,          // 팔로잉(웹 Following=User-Follow)
  pin: PinSvg,                   // 상단 고정(웹 Pin)
  'photo.album': PhotoAlbum,     // 이미지 첨부(웹 Photo-Album)
  poll: PollSvg,                 // 투표(웹 막대차트)
  edit: EditSvg,                 // 수정(웹 Edit=Pencil)
  trash: Delete2,                // 삭제(웹 Delete-2)
  collection: Collection,        // 컬렉션(웹 Collection=Bookmark)
  flag: Flag,                    // 신고(웹 Flag)
  document: Document,            // 약관·정책 문서(웹 terms.svg=Document)
  question: Question,            // 도움말·FAQ(웹 Question)
  'external.link': ExternalLink, // 외부(웹 브라우저) 링크 표시
  fullscreen: Fullscreen,        // 가사 전체화면 편집(웹 Fullscreen)
} as const

export type IconName = keyof typeof MAP

export function Icon({ name, size = 22, color = mono.color.text, style }: {
  name: IconName
  size?: number
  color?: string
  weight?: 'regular' | 'medium' | 'semibold' | 'bold'
  style?: StyleProp<ViewStyle>
}) {
  const C = MAP[name]
  return <C width={size} height={size} color={color} style={style} />
}
