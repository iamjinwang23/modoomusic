import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import * as WebBrowser from 'expo-web-browser'
import type { Notification, Song } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
import type { NowPlaying } from '@/lib/now-playing'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/ui/icon'
import { refreshUnreadNotifications } from '@/lib/use-unread-notifications'
import { SkeletonSongList } from '@/components/ui/skeleton'
import { mono } from '@/theme/mono'

const WEB_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.modoonorae.com'

type Category = 'all' | 'music' | 'community' | 'news'
const FILTERS: { key: Category; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'music', label: '음악' },
  { key: 'community', label: '커뮤니티' },
  { key: 'news', label: '새소식' },
]

const NOTICE_TYPES = ['system', 'community_closing', 'community_join_request', 'community_join_approved', 'community_join_rejected']

// 알림 → 카테고리(웹 NotificationPanel 파리티).
function categoryOf(n: Notification): Exclude<Category, 'all'> {
  if (n.type === 'community_like' || n.type === 'community_comment') return 'community'
  if (n.type === 'community_join_request' || n.type === 'community_join_approved' || n.type === 'community_join_rejected' || n.type === 'community_closing') return 'community'
  if (n.type === 'system') {
    const url = (n.payload as { url?: string })?.url
    return url?.startsWith('/community') ? 'community' : 'news'
  }
  return 'music'  // like·comment·song_complete·follow·credit_charged
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}일 전` : `${Math.floor(d / 7)}주 전`
}

// 웹 NotificationItem 파리티 — 곡 제목을 문장에 녹여 한 줄로(별도 서브라인 없이 정렬 균일화).
function message(n: Notification): string {
  const who = n.actorName ?? '누군가'
  const title = n.songTitle ?? '곡'
  const kind = (n.payload as { kind?: string })?.kind
  switch (n.type) {
    case 'like': return `${who}님이 '${title}'을 좋아해요`
    case 'comment': return kind === 'reply' ? `${who}님이 내 댓글에 답글을 남겼어요` : `${who}님이 '${title}'에 댓글을 남겼어요`
    case 'follow': return `${who}님이 회원님을 팔로우해요`
    case 'song_complete':
      if (kind === 'video_cover') return `'${title}'의 영상이 완성됐어요`
      if (kind === 'video_cover_failed') return `'${title}'의 영상 생성에 실패했어요 (크레딧 환불)`
      return `'${title}' 생성이 완성됐어요`
    case 'community_like': return `${who}님이 회원님의 글을 좋아해요`
    case 'community_comment': return kind === 'reply' ? `${who}님이 회원님의 댓글에 답글을 남겼어요` : `${who}님이 회원님의 글에 댓글을 남겼어요`
    case 'community_closing': return '가입한 커뮤니티가 곧 닫혀요'
    case 'community_join_request':
    case 'community_join_approved':
    case 'community_join_rejected': {
      const p = (n.payload as { title?: string; body?: string }) ?? {}
      return p.body || p.title || '커뮤니티 알림이 있어요'
    }
    case 'credit_charged': return '크레딧이 충전됐어요'
    case 'system': {
      // 공지(What's New) 발행 알림 — payload.title/body(웹 NotificationItem 파리티). 앱은 한 줄이라 제목 우선.
      const p = (n.payload as { title?: string; body?: string }) ?? {}
      return p.title || p.body || '새 알림이 있어요'
    }
    default: return '새 알림이 있어요'
  }
}

// 좌측 비주얼 — 소식/커뮤니티공지=원형 아이콘, 크레딧=원형 반짝, 곡 완성=사각 커버, 그 외=원형 아바타(웹 파리티).
function Visual({ n }: { n: Notification }) {
  if (NOTICE_TYPES.includes(n.type)) {
    return <View style={styles.iconCircle}><Icon name="notice" size={18} color={mono.color.accentLight} /></View>
  }
  if (n.type === 'credit_charged') {
    return <View style={styles.iconCircle}><Icon name="sparkle" size={18} color={mono.color.accentLight} /></View>
  }
  if (n.type === 'song_complete') {
    return (
      <View style={[styles.coverSquare, { backgroundColor: `hsl(${n.songCoverHue ?? 250}, 30%, 22%)` }]}>
        {n.songCoverImage ? <Image source={{ uri: n.songCoverImage }} style={styles.fill} contentFit="cover" /> : <Text style={styles.thumbIcon}>♪</Text>}
        <View style={styles.squareRing} pointerEvents="none" />
      </View>
    )
  }
  if (n.actorAvatarUrl) {
    return <View style={styles.avatarCircle}><Image source={{ uri: n.actorAvatarUrl }} style={styles.fill} contentFit="cover" /></View>
  }
  const letter = (n.actorName ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <View style={[styles.avatarCircle, { backgroundColor: `hsl(${n.actorAvatarHue ?? 250}, 40%, 32%)` }]}>
      <Text style={styles.letter}>{letter}</Text>
    </View>
  )
}

// 알림 인박스 — GET /api/notifications. 카테고리 필터·모두 읽음·탭 시 읽음(웹 파리티).
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const [items, setItems] = useState<Notification[] | null>(null)
  const [category, setCategory] = useState<Category>('all')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const j = await api.get('/api/notifications') as { notifications?: Notification[] }
      setItems(j.notifications ?? [])
    } catch (e) {
      setError((e as { error?: string; status?: number })?.status === 401 ? '로그인이 필요해요' : 'network_error')
      setItems([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const markRead = useCallback(async (n: Notification) => {
    if (n.readAt) return
    setItems((prev) => prev?.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x) ?? prev)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    refreshUnreadNotifications()
  }, [])

  // 알림 탭 → 읽음 처리 + 해당 콘텐츠로 이동(웹 NotificationPanel 파리티).
  // 모달에서 다른 화면으로 갈 땐 router.back() 후 push(플레이어 오너 탭과 동일 패턴).
  const openTarget = useCallback(async (n: Notification) => {
    markRead(n)
    // 곡(좋아요·댓글·완성) → 플레이어
    if ((n.type === 'like' || n.type === 'comment' || n.type === 'song_complete') && n.songId) {
      try {
        const j = await api.get(`/api/songs/${n.songId}`) as { song?: Song }
        if (j.song?.audioUrl) {
          await playSong(j.song as NowPlaying)
          router.back()
          router.push('/player')
        }
      } catch { /* 곡 삭제 등 — 무시 */ }
      return
    }
    // 팔로우 → 크리에이터 프로필
    if (n.type === 'follow') {
      const uname = (n.payload as { username?: string })?.username
      if (uname) { router.back(); router.push(`/creator/${uname}`) }
      return
    }
    // 시스템·커뮤니티 → payload.url. 커뮤니티는 네이티브 라우트, 그 외(공지 등)는 웹으로.
    const url = (n.payload as { url?: string })?.url
    if (!url) return
    if (url.startsWith('/community')) { router.back(); router.push(url as never) }
    else WebBrowser.openBrowserAsync(`${WEB_BASE}${url}`).catch(() => {})
  }, [markRead])

  const markAll = useCallback(async () => {
    setItems((prev) => prev?.map((x) => x.readAt ? x : { ...x, readAt: new Date().toISOString() }) ?? prev)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    refreshUnreadNotifications()
  }, [])

  const hasUnread = (items ?? []).some((n) => !n.readAt)
  const filtered = (items ?? []).filter((n) => category === 'all' || categoryOf(n) === category)

  return (
    <View style={[styles.container, { paddingTop: 8 }]}>
      <View style={styles.handleRow}><View style={styles.handle} /></View>
      <View style={styles.header}>
        <View style={{ width: 60 }} />
        <Text style={styles.title}>알림</Text>
        {hasUnread ? (
          <Pressable onPress={markAll} hitSlop={8}><Text style={styles.markAll}>모두 읽음</Text></Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <View style={styles.tabs}>
        {FILTERS.map((f) => {
          const on = category === f.key
          return (
            <Pressable key={f.key} onPress={() => setCategory(f.key)} style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{f.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {items === null && !error ? (
        <SkeletonSongList style={{ paddingHorizontal: 20, marginTop: 8 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => openTarget(item)} style={[styles.row, !item.readAt && styles.unread]}>
              <Visual n={item} />
              <View style={styles.body}>
                <Text style={styles.msg} numberOfLines={2}>{message(item)}</Text>
                <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '아직 알림이 없어요'}</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  handleRow: { alignItems: 'center', paddingTop: 4, paddingBottom: 38 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: mono.color.fillStrong },
  fill: { width: '100%', height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 20 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  markAll: { color: mono.color.accentLight, fontSize: mono.font.small, fontWeight: '700', width: 60, textAlign: 'right' },
  // 카테고리 필터 알약 — 둘러보기와 동일 토큰
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  tab: { paddingVertical: 11, paddingHorizontal: 20, borderRadius: mono.radius.pill, backgroundColor: mono.color.fill },
  tabOn: { backgroundColor: '#ffffff' },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '600' },
  tabTextOn: { color: mono.color.bg, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
  // 행 — 풀블리드, 하단 헤어라인 구분선. 미읽음=연한 바이올렛 틴트(박스 아님).
  // 비주얼·본문을 세로 중앙 정렬해 1~2줄 어느 쪽이든 균일하게 보이게(정렬 균일화).
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: mono.color.borderSoft,
  },
  unread: { backgroundColor: 'rgba(124,58,237,0.12)' },
  // 원형 아바타 / 아이콘
  avatarCircle: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(124,58,237,0.2)', alignItems: 'center', justifyContent: 'center' },
  letter: { color: mono.color.onMedia, fontSize: 18, fontWeight: '800' },
  // 사각형 곡 커버
  coverSquare: { width: 44, height: 44, borderRadius: mono.radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  squareRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: mono.radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  thumbIcon: { color: mono.color.textTertiary, fontSize: 18 },
  body: { flex: 1, gap: 3 },
  msg: { color: mono.color.text, fontSize: mono.font.body, lineHeight: 20 },
  time: { color: mono.color.textTertiary, fontSize: mono.font.tiny },
})
