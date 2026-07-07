import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { Song } from '@mono/shared'
import { api } from '@/lib/api'
import { subscribeSongUpdates } from '@/lib/generate'
import { useSession } from '@/lib/use-session'
import { SongRow } from '@/components/ui/song-row'
import { playSong } from '@/lib/player'
import { deleteSong, setSongPublished, shareSong } from '@/lib/song-actions'
import { mono } from '@/theme/mono'

// 라이브러리 — 내 곡(GET /api/songs/mine, 인증 필요). MONO 디자인.
// 생성 중 곡은 실시간(songs UPDATE 구독)으로 done/failed 전환 시 갱신.
export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const { session } = useSession()
  const [songs, setSongs] = useState<Song[] | null>(null)
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
    setRefreshing(true); await load(); setRefreshing(false)
  }, [load])

  // 곡 액션 시트 — 공유 / 공개토글 / 삭제. iOS 네이티브 시트, 그 외 Alert 폴백.
  const confirmDelete = useCallback((song: Song) => {
    Alert.alert('곡을 삭제할까요?', song.title?.trim() || '제목 없음', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await deleteSong(song.id); load() } },
    ])
  }, [load])

  const openMenu = useCallback((song: Song) => {
    const pub = song.published
    const doPublish = async () => { await setSongPublished(song.id, !pub); load() }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['공유', pub ? '비공개로 전환' : '공개하기', '삭제', '취소'], destructiveButtonIndex: 2, cancelButtonIndex: 3, title: song.title?.trim() || '제목 없음' },
        (i) => { if (i === 0) shareSong(song.id, song.title); else if (i === 1) doPublish(); else if (i === 2) confirmDelete(song) },
      )
    } else {
      Alert.alert(song.title?.trim() || '제목 없음', undefined, [
        { text: '공유', onPress: () => shareSong(song.id, song.title) },
        { text: pub ? '비공개로 전환' : '공개하기', onPress: doPublish },
        { text: '삭제', style: 'destructive', onPress: () => confirmDelete(song) },
        { text: '취소', style: 'cancel' },
      ])
    }
  }, [load, confirmDelete])

  const generating = (songs ?? []).some((s) => s.status === 'generating')

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>라이브러리</Text>
        <View style={styles.headerBtns}>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={styles.profileBtn}>
            <Text style={styles.profileIcon}>🔔</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/profile')} hitSlop={10} style={styles.profileBtn}>
            <Text style={styles.profileIcon}>☰</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.sub}>{generating ? '곡을 만들고 있어요…' : '내가 만든 음악'}</Text>

      {songs === null && !error ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={songs ?? []}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <SongRow song={item} onPress={() => playSong(item)} onMore={() => openMenu(item)} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 160, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '아직 만든 음악이 없어요'}</Text>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable style={[styles.fab, { bottom: insets.bottom + 76 }]} onPress={() => router.push('/create')}>
        <Text style={styles.fabText}>＋  만들기</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtns: { flexDirection: 'row', gap: 8 },
  profileBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.fill,
    alignItems: 'center', justifyContent: 'center',
  },
  profileIcon: { color: mono.color.text, fontSize: 18 },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800' },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2, marginBottom: 8 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
  fab: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: mono.color.accent, borderRadius: mono.radius.pill,
    paddingVertical: 14, paddingHorizontal: 28,
    // RN 0.86 New Arch: shadow* deprecated → boxShadow. elevation은 구아키텍처 안드 폴백.
    boxShadow: '0px 4px 12px rgba(0,0,0,0.35)', elevation: 6,
  },
  fabText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
})
