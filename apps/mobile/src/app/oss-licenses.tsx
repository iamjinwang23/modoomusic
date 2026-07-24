import { useMemo, useState } from 'react'
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'
import ossData from '@/data/oss-licenses.json'

// 오픈소스 라이선스 고지 — 앱이 사용하는 오픈소스 라이브러리 목록.
// 데이터는 scratchpad/gen-licenses.js로 node_modules에서 자동 추출(oss-licenses.json).
// 전문은 각 저장소 링크에 있으므로 목록엔 종류·링크만.
interface OssPkg { name: string; version: string; license: string; repository: string | null; author: string | null }
const PACKAGES = ossData as OssPkg[]

function openSource(p: OssPkg) {
  const url = p.repository ?? `https://www.npmjs.com/package/${p.name}`
  Linking.openURL(url).catch(() => {})
}

export default function OssLicensesScreen() {
  const insets = useSafeAreaInsets()
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return PACKAGES
    return PACKAGES.filter((p) => p.name.toLowerCase().includes(s) || p.license.toLowerCase().includes(s))
  }, [q])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Icon name="close" size={20} color={mono.color.text} /></Pressable>
        <Text style={styles.h1}>오픈소스 라이선스</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.intro}>MONO는 아래 오픈소스 소프트웨어를 사용해 만들어졌어요. 각 항목을 누르면 원본 저장소와 라이선스 전문을 볼 수 있어요.</Text>

      <View style={styles.searchBox}>
        <Icon name="magnifyingglass" size={16} color={mono.color.textTertiary} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="라이브러리 검색"
          placeholderTextColor={mono.color.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.name}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<Text style={styles.count}>{filtered.length}개 라이브러리</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openSource(item)}>
            <View style={styles.rowLeft}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.meta} numberOfLines={1}>v{item.version}{item.author ? ` · ${item.author}` : ''}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.license} numberOfLines={1}>{item.license}</Text>
              <Icon name="external.link" size={14} color={mono.color.textTertiary} />
            </View>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  h1: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  intro: { color: mono.color.textSecondary, fontSize: mono.font.small, lineHeight: 19, marginBottom: 14 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  search: { flex: 1, color: mono.color.text, fontSize: mono.font.body, padding: 0 },
  count: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginBottom: 8, marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: mono.color.borderSoft,
  },
  rowLeft: { flex: 1 },
  name: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  meta: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  license: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '500' },
})
