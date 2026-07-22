import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import type { PublicSong } from '@mono/shared'
import { api } from '@/lib/api'
import { useAuthGate } from '@/lib/auth-gate'
import { hapticLight } from '@/lib/haptics'
import { playSong } from '@/lib/player'
import { useAutoHideHeader } from '@/lib/use-auto-hide-header'
import { PublicSongRow } from '@/components/ui/public-song-row'
import { usePublicSongMore } from '@/lib/use-public-song-more'
import { Icon } from '@/components/ui/icon'
import { NotificationBell } from '@/components/ui/notification-bell'
import { SkeletonSongList } from '@/components/ui/skeleton'
import { HeaderMesh } from '@/components/ui/header-mesh'
import { mono } from '@/theme/mono'

type Tab = 'recommended' | 'latest' | 'popular'
const TABS: { key: Tab; label: string }[] = [
  { key: 'recommended', label: '추천' },
  { key: 'latest', label: '최신' },
  { key: 'popular', label: '인기' },
]

// 탐색 — 공개곡 피드(GET /api/explore/feed). 탭 탭→재생.
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { requireAuth } = useAuthGate()
  const { scrollHandler, headerStyle, onHeaderLayout, headerHeight: chipsH, translateY, headerH } = useAutoHideHeader(58)
  // 칩이 타이틀 뒤로 슬라이드하며 숨을 때 opacity도 페이드 — 투명 타이틀 뒤로 비치는 겹침 방지
  const chipsFade = useAnimatedStyle(() => ({ opacity: interpolate(translateY.value, [-headerH.value, -headerH.value * 0.4, 0], [0, 0.6, 1], 'clamp') }))
  const [titleH, setTitleH] = useState(insets.top + 56)
  const [tab, setTab] = useState<Tab>('recommended')
  const [songs, setSongs] = useState<PublicSong[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (t: Tab) => {
    setError(null)
    try {
      const j = await api.get(`/api/explore/feed?tab=${t}`) as { songs?: PublicSong[] }
      setSongs(j.songs ?? [])
    } catch (e) {
      setError((e as { error?: string })?.error ?? 'network_error')
      setSongs([])
    }
  }, [])
  const songMore = usePublicSongMore(() => load(tab))

  useEffect(() => { setSongs(null); load(tab) }, [tab, load])

  const onRefresh = useCallback(async () => {
    hapticLight()
    setRefreshing(true); await load(tab); setRefreshing(false)
  }, [load, tab])

  const loading = songs === null && !error

  // 상단 색감 워시용 hue — 피드 상단 커버 몇 개를 spread 샘플링(index 0·2·4)해 색 다양성 확보
  const topHues = useMemo(() => {
    const list = songs ?? []
    const hues = [0, 2, 4].map((i) => list[i]?.coverHue).filter((h): h is number => typeof h === 'number')
    return hues.length ? hues : [250]
  }, [songs])
  const meshH = titleH + chipsH + 90

  return (
    <View style={styles.container}>
      <Animated.FlatList
        data={songs ?? []}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <PublicSongRow
            song={item}
            onPress={() => playSong(item, songs ?? [item])}
            onCreatorPress={() => router.push(`/creator/${item.username}`)}
            onMore={() => songMore.open(item)}
          />
        )}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: titleH + chipsH + 4, paddingBottom: insets.bottom + 120, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl progressViewOffset={titleH + chipsH} refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
        ListEmptyComponent={
          loading ? <SkeletonSongList />
            : <Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '공개된 곡이 없어요'}</Text>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* 상단 색감 워시(매시) — 헤더 바 뒤, 콘텐츠 위 */}
      <View pointerEvents="none" style={[styles.mesh, { height: meshH }]}>
        <HeaderMesh hues={topHues} width={width} height={meshH} fadeStart={(titleH + chipsH) / meshH} />
      </View>

      {/* 필터칩 — auto-hide(타이틀 아래) */}
      <Animated.View style={[styles.chipsBar, { top: titleH }, headerStyle, chipsFade]} onLayout={onHeaderLayout}>
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const on = tab === t.key
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </Animated.View>

      {/* 타이틀 — 고정 */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 12 }]} onLayout={(e) => setTitleH(e.nativeEvent.layout.height)}>
        <View style={styles.headerRow}>
          <Text style={styles.h1}>둘러보기</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push('/search')} hitSlop={10} style={styles.searchBtn}>
              <Icon name="magnifyingglass" size={18} color={mono.color.text} />
            </Pressable>
            <Pressable onPress={() => { if (requireAuth()) router.push('/notifications') }} hitSlop={10} style={styles.searchBtn}>
              <NotificationBell size={18} color={mono.color.text} />
            </Pressable>
          </View>
        </View>
      </View>
      {songMore.sheet}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  // 고정 타이틀바(위) + auto-hide 칩바(아래, 타이틀 뒤로 슬라이드)
  // 바 배경은 투명 — 뒤의 색감 워시(mesh)가 헤더 배경 역할(불투명 다크 베이스로 콘텐츠 마스킹)
  mesh: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  titleBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: 'transparent', paddingHorizontal: 20, paddingBottom: 8,
  },
  chipsBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    backgroundColor: 'transparent', paddingHorizontal: 20, paddingBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.fill, alignItems: 'center', justifyContent: 'center' },
  searchIcon: { fontSize: 16 },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingVertical: 11, paddingHorizontal: 20, borderRadius: mono.radius.pill, backgroundColor: mono.color.fill },
  tabOn: { backgroundColor: '#ffffff' },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '600' },
  tabTextOn: { color: mono.color.bg, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
})
