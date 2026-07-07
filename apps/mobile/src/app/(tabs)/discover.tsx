import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import type { PublicSong } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
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
      <Text style={styles.h1}>탐색</Text>
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
          renderItem={({ item }) => <PublicSongRow song={item} onPress={() => playSong(item)} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
          ListEmptyComponent={<Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '공개된 곡이 없어요'}</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

function PublicSongRow({ song, onPress }: { song: PublicSong; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.cover}>
        {song.coverImage ? <Image source={{ uri: song.coverImage }} style={styles.coverImg} contentFit="cover" /> : null}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>{song.title ?? '제목 없음'}</Text>
        <Text style={styles.creator} numberOfLines={1}>{song.displayName || song.username}</Text>
      </View>
      <Text style={styles.stat}>♥ {song.likeCount}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800', marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: mono.radius.pill, backgroundColor: mono.color.fill },
  tabOn: { backgroundColor: mono.color.accent },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  tabTextOn: { color: mono.color.text, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  pressed: { opacity: 0.7 },
  cover: { width: 52, height: 52, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  coverImg: { width: '100%', height: '100%' },
  rowBody: { flex: 1, gap: 3 },
  title: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  creator: { color: mono.color.textSecondary, fontSize: mono.font.small },
  stat: { color: mono.color.textTertiary, fontSize: mono.font.small },
})
