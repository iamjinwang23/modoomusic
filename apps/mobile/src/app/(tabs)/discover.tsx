import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import type { PublicSong } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
import { PublicSongRow } from '@/components/ui/public-song-row'
import { Icon } from '@/components/ui/icon'
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

  useEffect(() => { setSongs(null); load(tab) }, [tab, load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(tab); setRefreshing(false)
  }, [load, tab])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>둘러보기</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/search')} hitSlop={10} style={styles.searchBtn}>
            <Icon name="magnifyingglass" size={18} color={mono.color.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={styles.searchBtn}>
            <Icon name="bell" size={18} color={mono.color.text} />
          </Pressable>
        </View>
      </View>
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

      {songs === null && !error ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={songs ?? []}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <PublicSongRow
              song={item}
              onPress={() => playSong(item)}
              onCreatorPress={() => router.push(`/creator/${item.username}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
          ListEmptyComponent={<Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '공개된 곡이 없어요'}</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.fill, alignItems: 'center', justifyContent: 'center' },
  searchIcon: { fontSize: 16 },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: mono.radius.pill, backgroundColor: mono.color.fill },
  tabOn: { backgroundColor: mono.color.accent },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  tabTextOn: { color: mono.color.text, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
})
