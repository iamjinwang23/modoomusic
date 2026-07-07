import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Community } from '@mono/shared'
import { api } from '@/lib/api'
import { CommunityCard } from '@/components/ui/community-card'
import { mono } from '@/theme/mono'

type Tab = 'popular' | 'new'
const TABS: { key: Tab; label: string }[] = [
  { key: 'popular', label: '인기' },
  { key: 'new', label: '최신' },
]

// 커뮤니티 — 인기/최신 탭 + MONO 카드 목록. 공용 API(/api/communities/list) 재사용.
export default function ExploreScreen() {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<Tab>('popular')
  const [items, setItems] = useState<Community[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (t: Tab) => {
    setError(null)
    try {
      const j: { communities?: Community[] } = await api.get(`/api/communities/list?type=${t}`)
      setItems(j.communities ?? [])
    } catch (e) {
      setError((e as { error?: string })?.error ?? 'network_error')
      setItems([])
    }
  }, [])

  useEffect(() => { setItems(null); load(tab) }, [tab, load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(tab); setRefreshing(false)
  }, [load, tab])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.h1}>커뮤니티</Text>

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

      {items === null && !error ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => <CommunityCard community={item} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
          ListEmptyComponent={
            <Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '아직 커뮤니티가 없어요'}</Text>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800', marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: mono.radius.pill,
    backgroundColor: mono.color.fill,
  },
  tabOn: { backgroundColor: mono.color.accent },
  tabText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  tabTextOn: { color: mono.color.text, fontWeight: '700' },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 48 },
})
