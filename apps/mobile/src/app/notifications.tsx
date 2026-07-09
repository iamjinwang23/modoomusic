import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import type { Notification } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { mono } from '@/theme/mono'

type Category = 'all' | 'music' | 'community' | 'news'
const FILTERS: { key: Category; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'music', label: '음악' },
  { key: 'community', label: '커뮤니티' },
  { key: 'news', label: '새소식' },
]

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

function message(n: Notification): string {
  const who = n.actorName ?? '누군가'
  switch (n.type) {
    case 'like': return `${who}님이 회원님의 곡을 좋아해요`
    case 'comment': return `${who}님이 곡에 댓글을 남겼어요`
    case 'follow': return `${who}님이 회원님을 팔로우해요`
    case 'song_complete': return '곡이 완성됐어요'
    case 'community_like': return `${who}님이 게시글을 좋아해요`
    case 'community_comment': return `${who}님이 게시글에 댓글을 남겼어요`
    case 'community_closing': return '가입한 커뮤니티가 곧 닫혀요'
    case 'community_join_request':
    case 'community_join_approved':
    case 'community_join_rejected': {
      const p = (n.payload as { title?: string; body?: string }) ?? {}
      return p.body || p.title || '커뮤니티 알림이 있어요'
    }
    case 'credit_charged': return '크레딧이 충전됐어요'
    default: return '새 알림이 있어요'
  }
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

  // 개별 읽음(탭) — 웹처럼 직접 notifications.read_at 업데이트(RLS: 본인 row만)
  const markRead = useCallback(async (n: Notification) => {
    if (n.readAt) return
    setItems((prev) => prev?.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x) ?? prev)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
  }, [])

  const markAll = useCallback(async () => {
    setItems((prev) => prev?.map((x) => x.readAt ? x : { ...x, readAt: new Date().toISOString() }) ?? prev)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
  }, [])

  const hasUnread = (items ?? []).some((n) => !n.readAt)
  const filtered = (items ?? []).filter((n) => category === 'all' || categoryOf(n) === category)

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
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
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
          renderItem={({ item }) => {
            const thumb = item.songCoverImage ?? item.actorAvatarUrl
            return (
              <Pressable onPress={() => markRead(item)} style={[styles.row, !item.readAt && styles.unread]}>
                <View style={styles.thumb}>
                  {thumb ? <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" /> : <Text style={styles.thumbIcon}>♪</Text>}
                </View>
                <View style={styles.body}>
                  <Text style={styles.msg} numberOfLines={2}>{message(item)}</Text>
                  {item.songTitle ? <Text style={styles.sub} numberOfLines={1}>{item.songTitle}</Text> : null}
                  <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                </View>
                {!item.readAt ? <View style={styles.dot} /> : null}
              </Pressable>
            )
          }}
          ListEmptyComponent={<Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '아직 알림이 없어요'}</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  close: { color: mono.color.text, fontSize: 22, width: 60 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  markAll: { color: mono.color.accentLight, fontSize: mono.font.small, fontWeight: '700', width: 60, textAlign: 'right' },
  // 카테고리 필터 알약 — 앱 표준(활성=화이트). 한 줄 배치(늘어남 방지)
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  tab: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: mono.radius.pill, backgroundColor: mono.color.fill },
  tabOn: { backgroundColor: '#ffffff' },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  tabTextOn: { color: mono.color.bg, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderRadius: mono.radius.md, paddingHorizontal: 8 },
  unread: { backgroundColor: mono.color.fill },
  thumb: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  thumbIcon: { color: mono.color.textTertiary, fontSize: 18 },
  body: { flex: 1, gap: 2 },
  msg: { color: mono.color.text, fontSize: mono.font.body, lineHeight: 20 },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small },
  time: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: mono.color.accent },
})
