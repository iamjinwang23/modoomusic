import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import type { Collection, Song } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
import { collections as collectionStore } from '@/lib/collection'
import { SongRow } from '@/components/ui/song-row'
import { CollectionCover } from '@/components/ui/collection-cover'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 컬렉션 상세 — 담긴 곡 목록. songIds를 내 곡(/api/songs/mine)에서 해석(웹은 클라 캐시).
// ⚠️ 타인 공개곡을 담은 경우 v1에선 목록에 안 뜸(내 곡만 해석). 후속 개선.
export default function CollectionDetailScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [col, setCol] = useState<Collection | null>(null)
  const [mine, setMine] = useState<Song[] | null>(null)

  const loadCol = useCallback(async () => {
    const all = await collectionStore.getAll()
    setCol(all.find((c) => c.id === id) ?? null)
  }, [id])

  useEffect(() => { loadCol() }, [loadCol])
  useEffect(() => {
    api.get('/api/songs/mine').then((j: { songs?: Song[] }) => setMine(j.songs ?? [])).catch(() => setMine([]))
  }, [])

  // 컬렉션 songIds 순서대로, 내 곡에서 해석
  const songs: Song[] = col && mine
    ? col.songIds.map((sid) => mine.find((s) => s.id === sid)).filter((s): s is Song => !!s)
    : []

  const removeSong = (song: Song) => {
    if (!col) return
    Alert.alert(song.title?.trim() || '곡', '컬렉션에서 뺄까요?', [
      { text: '취소', style: 'cancel' },
      { text: '빼기', style: 'destructive', onPress: async () => { await collectionStore.removeSong(col.id, song.id); loadCol() } },
    ])
  }

  const deleteCollection = () => {
    if (!col) return
    Alert.alert(`'${col.name}' 삭제`, '이 컬렉션을 삭제할까요? 담긴 곡은 삭제되지 않아요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await collectionStore.remove(col.id); router.back() } },
    ])
  }

  const loading = !col || mine === null

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Icon name="arrow.left" size={22} color={mono.color.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{col?.name ?? '컬렉션'}</Text>
        {col ? (
          <Pressable onPress={deleteCollection} hitSlop={12} style={styles.iconBtn}>
            <Icon name="trash" size={20} color={mono.color.textSecondary} />
          </Pressable>
        ) : <View style={styles.iconBtn} />}
      </View>

      {loading ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={
            <View style={styles.hero}>
              <CollectionCover collection={col} size={96} radius={mono.radius.md} />
              <Text style={styles.heroCount}>{col.songIds.length}곡</Text>
            </View>
          }
          renderItem={({ item }) => (
            <SongRow song={item} onPress={() => playSong(item, songs)} onMore={() => removeSong(item)} />
          )}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 160 }}
          ListEmptyComponent={<Text style={styles.empty}>아직 담긴 곡이 없어요</Text>}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', textAlign: 'center' },
  hero: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  heroCount: { color: mono.color.textTertiary, fontSize: mono.font.small },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
})
