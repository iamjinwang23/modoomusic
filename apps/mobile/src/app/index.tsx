import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Song } from '@mono/shared'
import { api } from '@/lib/api'
import { SongRow } from '@/components/ui/song-row'
import { playSong } from '@/lib/player'
import { mono } from '@/theme/mono'

// 라이브러리 — 내 곡(GET /api/songs/mine, 인증 필요). MONO 디자인.
export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const [songs, setSongs] = useState<Song[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  useEffect(() => { load() }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false)
  }, [load])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.h1}>라이브러리</Text>
      <Text style={styles.sub}>내가 만든 음악</Text>

      {songs === null && !error ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={songs ?? []}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <SongRow song={item} onPress={() => playSong(item)} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '아직 만든 음악이 없어요'}</Text>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800' },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2, marginBottom: 8 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
})
