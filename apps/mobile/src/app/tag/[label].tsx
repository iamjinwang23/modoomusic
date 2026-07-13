import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import type { PublicSong } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
import { PublicSongRow } from '@/components/ui/public-song-row'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 태그(장르/무드) 곡 목록 — 검색의 태그 칩 탭 시 진입. /api/search?q=<label>의 곡을 표시.
export default function TagScreen() {
  const insets = useSafeAreaInsets()
  const { label } = useLocalSearchParams<{ label: string }>()
  const [songs, setSongs] = useState<PublicSong[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!label) return
    setError(false)
    try {
      const r = await api.get(`/api/search?q=${encodeURIComponent(label)}`) as { data?: { songs?: PublicSong[] } }
      setSongs(r.data?.songs ?? [])
    } catch {
      setError(true); setSongs([])
    }
  }, [label])

  useEffect(() => { load() }, [load])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Icon name="arrow.left" size={24} color={mono.color.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{label}</Text>
        <View style={{ width: 32 }} />
      </View>

      {songs === null && !error ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={songs ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <PublicSongRow
              song={item}
              onPress={() => playSong(item, songs ?? [item])}
              onCreatorPress={() => router.push(`/creator/${item.username}`)}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>{error ? '불러오지 못했어요' : '해당 태그의 곡이 없어요'}</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
})
