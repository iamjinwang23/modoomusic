import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { api } from '@/lib/api'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 크레딧 내역 — 설정 크레딧 카드에서 진입. 대시보드(잔여·보너스·충전·사용가능) + 전체/충전/사용 내역.
interface CreditState { used: number; limit: number; remaining: number; bonus: number; paid: number; total: number }
interface Tx { id: string; category: 'charge' | 'usage'; kind: 'charge' | 'use' | 'refund'; amount: number; source: string; title: string; createdAt: string }

const TABS: { key: 'all' | 'charge' | 'usage'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'charge', label: '충전' },
  { key: 'usage', label: '사용' },
]
const PAGE = 30
const POSITIVE = '#4ade80'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function CreditHistoryScreen() {
  const insets = useSafeAreaInsets()
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [tab, setTab] = useState<'all' | 'charge' | 'usage'>('all')
  const [items, setItems] = useState<Tx[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    api.get('/api/credits/me').then((c) => setCredits(c as CreditState)).catch(() => setCredits(null))
  }, [])

  const load = useCallback(async (t: 'all' | 'charge' | 'usage', off: number) => {
    const j = (await api.get(`/api/credits/transactions?type=${t}&limit=${PAGE}&offset=${off}`)) as { transactions: Tx[]; hasMore: boolean }
    return j
  }, [])

  // 탭 전환 시 리스트 리셋 후 첫 페이지
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load(tab, 0)
      .then((j) => { if (cancelled) return; setItems(j.transactions); setOffset(j.transactions.length); setHasMore(j.hasMore) })
      .catch(() => { if (!cancelled) { setItems([]); setHasMore(false) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab, load])

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return
    setLoadingMore(true)
    load(tab, offset)
      .then((j) => { setItems((prev) => [...prev, ...j.transactions]); setOffset((o) => o + j.transactions.length); setHasMore(j.hasMore) })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }, [loadingMore, loading, hasMore, load, tab, offset])

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Icon name="close" size={20} color={mono.color.text} /></Pressable>
        <Text style={styles.h1}>크레딧 내역</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            {/* 대시보드 */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>사용 가능 크레딧</Text>
              <Text style={styles.heroValue}>{credits ? credits.total : '—'}</Text>
              <View style={styles.breakdown}>
                <Stat label="오늘 남은" value={credits ? `${credits.remaining}` : '—'} />
                <View style={styles.vline} />
                <Stat label="보너스" value={credits ? `${credits.bonus}` : '—'} />
                <View style={styles.vline} />
                <Stat label="충전" value={credits ? `${credits.paid}` : '—'} />
              </View>
            </View>

            {/* 세그먼트 탭 */}
            <View style={styles.tabs}>
              {TABS.map((t) => (
                <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {loading && <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />}
            {!loading && items.length === 0 && (
              <Text style={styles.empty}>{tab === 'charge' ? '충전 내역이 없어요.' : tab === 'usage' ? '사용 내역이 없어요.' : '내역이 없어요.'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const positive = item.amount > 0
          return (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title || (item.category === 'charge' ? '크레딧 충전' : '크레딧 사용')}</Text>
                <Text style={styles.rowWhen}>{fmtWhen(item.createdAt)}</Text>
              </View>
              <Text style={[styles.amount, positive ? styles.amountPos : styles.amountNeg]}>
                {positive ? '+' : ''}{item.amount}
              </Text>
            </View>
          )
        }}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={mono.color.textTertiary} style={{ marginVertical: 16 }} /> : null}
      />
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  h1: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  hero: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, borderWidth: 1, borderColor: mono.color.borderSoft,
    paddingVertical: 22, paddingHorizontal: 20, alignItems: 'center', marginTop: 8,
  },
  heroLabel: { color: mono.color.textSecondary, fontSize: mono.font.small },
  heroValue: { color: mono.color.text, fontSize: 44, fontWeight: '800', marginTop: 4, marginBottom: 18 },
  breakdown: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  statLabel: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 3 },
  vline: { width: 1, height: 30, backgroundColor: mono.color.borderSoft },
  tabs: { flexDirection: 'row', backgroundColor: mono.color.fill, borderRadius: mono.radius.md, padding: 4, marginTop: 20, marginBottom: 6 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: mono.radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: mono.color.surface2 },
  tabText: { color: mono.color.textTertiary, fontSize: mono.font.body, fontWeight: '600' },
  tabTextActive: { color: mono.color.text },
  empty: { color: mono.color.textTertiary, fontSize: mono.font.body, textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: mono.color.borderSoft,
  },
  rowLeft: { flex: 1 },
  rowTitle: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '500' },
  rowWhen: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 3 },
  amount: { fontSize: mono.font.body, fontWeight: '700' },
  amountPos: { color: POSITIVE },
  amountNeg: { color: mono.color.text },
})
