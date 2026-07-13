import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { Song } from '@mono/shared'
import { api } from '@/lib/api'
import { hapticLight } from '@/lib/haptics'
import { subscribeSongUpdates } from '@/lib/generate'
import { useSession } from '@/lib/use-session'
import { useAutoHideHeader } from '@/lib/use-auto-hide-header'
import { SongRow } from '@/components/ui/song-row'
import { Icon } from '@/components/ui/icon'
import { NotificationBell } from '@/components/ui/notification-bell'
import { playSong } from '@/lib/player'
import { deleteSong, downloadSong, setSongPublished } from '@/lib/song-actions'
import { isCollected, toggleCollected } from '@/lib/collection'
import { SongMoreSheet } from '@/components/ui/song-more-sheet'
import { SongEditModal } from '@/components/ui/song-edit-modal'
import { mono } from '@/theme/mono'

type Filter = 'all' | 'liked' | 'published'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'liked', label: '좋아요' },
  { key: 'published', label: '공개' },
]

// 라이브러리 — 내 곡(GET /api/songs/mine, 인증 필요). MONO 디자인.
// 생성 중 곡은 실시간(songs UPDATE 구독)으로 done/failed 전환 시 갱신.
export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const { scrollHandler, headerStyle, onHeaderLayout, headerHeight: chipsH } = useAutoHideHeader(58)
  const [titleH, setTitleH] = useState(insets.top + 56)
  const { session } = useSession()
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const loadedOnce = useRef(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const j: { songs?: Song[] } = await api.get('/api/songs/mine')
      setSongs(j.songs ?? [])
    } catch (e) {
      const err = e as { error?: string; status?: number }
      setError(err.status === 401 ? '로그인이 필요해요' : err.error ?? 'network_error')
      setSongs([])
    }
  }, [])

  useEffect(() => { load(); loadedOnce.current = true }, [load])

  // 화면 복귀 시 갱신(생성 화면에서 만들기 후 돌아왔을 때)
  useFocusEffect(useCallback(() => { if (loadedOnce.current) load() }, [load]))

  // 실시간: 내 곡 상태 전환 시 목록 재로딩(생성 완료 반영)
  useEffect(() => {
    const uid = session?.user?.id
    if (!uid) return
    return subscribeSongUpdates(uid, () => load())
  }, [session?.user?.id, load])

  const onRefresh = useCallback(async () => {
    hapticLight()
    setRefreshing(true); await load(); setRefreshing(false)
  }, [load])

  // 곡 더보기 — 바텀시트 모달(플레이어와 동일). 시트 닫힘(300ms) 후 액션이 실행돼 ref로 곡 유지.
  const [moreSong, setMoreSong] = useState<Song | null>(null)
  const [editSong, setEditSong] = useState<Song | null>(null)
  const [moreCollected, setMoreCollected] = useState(false)
  const moreRef = useRef<Song | null>(null)
  useEffect(() => { if (moreSong) isCollected(moreSong.id).then(setMoreCollected) }, [moreSong])

  const openMenu = useCallback((song: Song) => { moreRef.current = song; setMoreSong(song) }, [])
  const confirmDelete = useCallback((song: Song) => {
    Alert.alert('곡을 삭제할까요?', song.title?.trim() || '제목 없음', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await deleteSong(song.id); load() } },
    ])
  }, [load])

  const generating = (songs ?? []).some((s) => s.status === 'generating')
  const filtered = (songs ?? []).filter((s) => {
    if (filter === 'liked') return !!s.liked
    if (filter === 'published') return !!s.published
    return true
  })

  const loading = songs === null && !error

  return (
    <View style={styles.container}>
      <Animated.FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <SongRow song={item} onPress={() => playSong(item, filtered)} onMore={() => openMenu(item)} />}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: titleH + chipsH + 4, paddingBottom: insets.bottom + 160, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl progressViewOffset={titleH + chipsH} refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
            : <Text style={styles.empty}>
                {error ? `불러오지 못했어요 (${error})`
                  : filter === 'liked' ? '좋아요한 곡이 없어요'
                  : filter === 'published' ? '공개한 곡이 없어요'
                  : '아직 만든 음악이 없어요'}
              </Text>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* 필터칩(+생성 중 안내) — auto-hide(타이틀 아래) */}
      <Animated.View style={[styles.chipsBar, { top: titleH }, headerStyle]} onLayout={onHeaderLayout}>
        <View style={styles.tabs}>
          {FILTERS.map((f) => {
            const on = filter === f.key
            return (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{f.label}</Text>
              </Pressable>
            )
          })}
        </View>
        {generating ? <Text style={styles.sub}>곡을 만들고 있어요…</Text> : null}
      </Animated.View>

      {/* 타이틀 — 고정 */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 12 }]} onLayout={(e) => setTitleH(e.nativeEvent.layout.height)}>
        <View style={styles.headerRow}>
          <Text style={styles.h1}>라이브러리</Text>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={styles.profileBtn}>
            <NotificationBell size={19} color={mono.color.text} />
          </Pressable>
        </View>
      </View>

      {/* 곡 더보기 바텀시트 (내 곡 = 소유자 메뉴) */}
      <SongMoreSheet
        open={!!moreSong}
        onClose={() => setMoreSong(null)}
        isOwner
        published={!!moreSong?.published}
        collected={moreCollected}
        onCollect={async () => { const s = moreRef.current; if (s) setMoreCollected(await toggleCollected(s.id)) }}
        onPublishToggle={async () => { const s = moreRef.current; if (s) { await setSongPublished(s.id, !s.published); load() } }}
        onDownload={async () => { const s = moreRef.current; if (s?.audioUrl && !(await downloadSong(s.audioUrl, s.title))) Alert.alert('다운로드에 실패했어요') }}
        onVideoCover={() => { const s = moreRef.current; if (s) router.push(`/video-create?songId=${s.id}`) }}
        onEdit={() => setEditSong(moreRef.current)}
        onDelete={() => { const s = moreRef.current; if (s) confirmDelete(s) }}
        onReport={() => {}}
      />
      <SongEditModal
        open={!!editSong}
        onClose={() => setEditSong(null)}
        song={editSong ? { id: editSong.id, title: editSong.title, lyrics: editSong.lyrics ?? null, publishComment: editSong.publishComment ?? null } : null}
        onSaved={() => load()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  // 고정 타이틀바(위) + auto-hide 칩바(아래)
  titleBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: mono.color.bg, paddingHorizontal: 20, paddingBottom: 8,
  },
  chipsBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    backgroundColor: mono.color.bg, paddingHorizontal: 20, paddingBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtns: { flexDirection: 'row', gap: 8 },
  profileBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.fill,
    alignItems: 'center', justifyContent: 'center',
  },
  profileIcon: { color: mono.color.text, fontSize: 18 },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800' },
  // 필터칩 — 둘러보기와 동일 사이즈, 활성=화이트 채움(다크 텍스트)
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingVertical: 11, paddingHorizontal: 20, borderRadius: mono.radius.pill, backgroundColor: mono.color.fill },
  tabOn: { backgroundColor: '#ffffff' },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '600' },
  tabTextOn: { color: mono.color.bg, fontWeight: '700' },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 10, marginBottom: 8 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
  fab: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: mono.color.accent, borderRadius: mono.radius.pill,
    paddingVertical: 14, paddingHorizontal: 26,
    // RN 0.86 New Arch: shadow* deprecated → boxShadow. elevation은 구아키텍처 안드 폴백.
    boxShadow: '0px 4px 12px rgba(0,0,0,0.35)', elevation: 6,
  },
  fabText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
})
