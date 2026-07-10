import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import type { PublicSong } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
import { addRecent, clearRecents, loadRecents, removeRecent } from '@/lib/recent-searches'
import { PublicSongRow } from '@/components/ui/public-song-row'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

interface SearchUser { id: string; username: string; displayName: string; avatarUrl: string | null; followerCount: number }
interface SearchTag { label: string; type: 'genre' | 'mood'; count: number }
interface Results { songs: PublicSong[]; users: SearchUser[]; tags: SearchTag[] }

type Item =
  | { kind: 'header'; label: string }
  | { kind: 'song'; song: PublicSong }
  | { kind: 'user'; user: SearchUser }
  | { kind: 'tags'; tags: SearchTag[] }

// 검색 — 곡/유저/태그(GET /api/search?q=). 디바운스 300ms. 최근 검색·태그 칩(웹 파리티).
export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const { q: initialQ } = useLocalSearchParams<{ q?: string }>()
  const [q, setQ] = useState(initialQ ?? '')
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { loadRecents().then(setRecents) }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const query = q.trim()
    if (!query) { setResults(null); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/api/search?q=${encodeURIComponent(query)}`) as { data?: Results }
        setResults(r.data ?? { songs: [], users: [], tags: [] })
      } catch {
        setResults({ songs: [], users: [], tags: [] })
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  // 검색 확정(엔터) 시 최근 검색에 추가
  const commitRecent = useCallback(() => {
    const t = q.trim()
    if (t) addRecent(t).then(setRecents)
  }, [q])

  const onRemoveRecent = useCallback((r: string) => { removeRecent(r).then(setRecents) }, [])
  const onClearRecents = useCallback(() => { clearRecents().then(() => setRecents([])) }, [])

  // 결과 목록 — 웹 순서: 곡 → 사용자 → 태그
  const items: Item[] = []
  if (results) {
    if (results.songs.length) {
      items.push({ kind: 'header', label: '곡' })
      results.songs.forEach((s) => items.push({ kind: 'song', song: s }))
    }
    if (results.users.length) {
      items.push({ kind: 'header', label: '사용자' })
      results.users.forEach((u) => items.push({ kind: 'user', user: u }))
    }
    if (results.tags.length) {
      items.push({ kind: 'header', label: '태그' })
      items.push({ kind: 'tags', tags: results.tags })
    }
  }

  const showRecents = !q.trim()

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="곡·아티스트·태그 검색"
          placeholderTextColor={mono.color.textTertiary}
          value={q}
          onChangeText={setQ}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={commitRecent}
        />
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.cancel}>취소</Text></Pressable>
      </View>

      {showRecents ? (
        recents.length > 0 ? (
          <FlatList
            data={recents}
            keyExtractor={(r) => r}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListHeaderComponent={
              <View style={styles.recentHead}>
                <Text style={styles.recentTitle}>최근 검색</Text>
                <Pressable onPress={onClearRecents} hitSlop={8}><Text style={styles.clearAll}>모두 지우기</Text></Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.recentRow} onPress={() => setQ(item)}>
                <Icon name="magnifyingglass" size={16} color={mono.color.textTertiary} />
                <Text style={styles.recentText} numberOfLines={1}>{item}</Text>
                <Pressable onPress={() => onRemoveRecent(item)} hitSlop={10} style={styles.recentRemove}>
                  <Icon name="close" size={14} color={mono.color.textTertiary} />
                </Pressable>
              </Pressable>
            )}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <Text style={styles.hint}>곡 제목이나 아티스트를 검색해보세요</Text>
        )
      ) : loading && !results ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, i) => (it.kind === 'song' ? `s${it.song.id}` : it.kind === 'user' ? `u${it.user.id}` : it.kind === 'tags' ? 'tags' : `h${it.label}${i}`)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.kind === 'header') return <Text style={styles.section}>{item.label}</Text>
            if (item.kind === 'song') return <PublicSongRow song={item.song} onPress={() => playSong(item.song)} onCreatorPress={() => router.push(`/creator/${item.song.username}`)} />
            if (item.kind === 'tags') {
              return (
                <View style={styles.tagWrap}>
                  {item.tags.map((t) => (
                    <Pressable key={`${t.type}-${t.label}`} style={styles.tagChip} onPress={() => setQ(t.label)}>
                      <Text style={styles.tagLabel}>{t.label}</Text>
                      <Text style={styles.tagCount}>{t.count}곡</Text>
                    </Pressable>
                  ))}
                </View>
              )
            }
            const u = item.user
            return (
              <Pressable style={styles.userRow} onPress={() => router.push(`/creator/${u.username}`)}>
                <View style={styles.avatar}>
                  {u.avatarUrl ? <Image source={{ uri: u.avatarUrl }} style={styles.avatarImg} contentFit="cover" /> : <Text style={styles.avatarText}>{(u.displayName || u.username).charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.userName} numberOfLines={1}>{u.displayName || u.username}</Text>
                  <Text style={styles.userMeta} numberOfLines={1}>@{u.username} · 팔로워 {u.followerCount}</Text>
                </View>
              </Pressable>
            )
          }}
          ListEmptyComponent={q.trim() && !loading ? <Text style={styles.empty}>검색 결과가 없어요</Text> : null}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  input: {
    flex: 1, backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  cancel: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '600' },
  section: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
  hint: { color: mono.color.textTertiary, fontSize: mono.font.small, textAlign: 'center', marginTop: 48 },
  // 최근 검색
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 4 },
  recentTitle: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '700' },
  clearAll: { color: mono.color.textTertiary, fontSize: mono.font.small },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  recentText: { flex: 1, color: mono.color.text, fontSize: mono.font.body },
  recentRemove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  // 사용자 행
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.accentLight, fontSize: 17, fontWeight: '800' },
  userName: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  userMeta: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 2 },
  // 태그 칩
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: mono.radius.pill,
    backgroundColor: mono.color.fill, borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  tagLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  tagCount: { color: mono.color.textTertiary, fontSize: mono.font.small },
})
