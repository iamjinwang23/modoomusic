import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '@/lib/api'

// T9 BFF 스모크 — 앱이 공용 API(/api/communities/list)를 호출해 데이터를 그린다.
// 앱→(Bearer 있으면 첨부)→기존 Next.js API→Supabase 경로 실증.
interface Community { id: string; name: string; memberCount?: number }

export default function ExploreScreen() {
  const insets = useSafeAreaInsets()
  const [items, setItems] = useState<Community[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/communities/list?type=popular')
      .then((j: { communities?: Community[] }) => setItems(j.communities ?? []))
      .catch((e: { error?: string }) => setError(e?.error ?? 'network_error'))
  }, [])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.h1}>커뮤니티</Text>
      <Text style={styles.sub}>BFF 스모크 · /api/communities/list</Text>
      {error ? <Text style={styles.error}>에러: {error}</Text> : null}
      {items === null && !error ? (
        <ActivityIndicator color="#7c3aed" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              {typeof item.memberCount === 'number' ? (
                <Text style={styles.meta}>멤버 {item.memberCount}</Text>
              ) : null}
            </View>
          )}
          ListEmptyComponent={items ? <Text style={styles.meta}>커뮤니티가 없어요</Text> : null}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111318', paddingHorizontal: 20 },
  h1: { color: '#fff', fontSize: 26, fontWeight: '800' },
  sub: { color: '#6b7280', fontSize: 12, marginTop: 2, marginBottom: 16 },
  error: { color: '#f87171', fontSize: 14, marginTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  name: { color: '#fff', fontSize: 16, fontWeight: '600' },
  meta: { color: '#9ca3af', fontSize: 13 },
})
