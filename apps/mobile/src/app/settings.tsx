import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

interface CreditState { used: number; limit: number; remaining: number; bonus: number; paid: number; total: number }

// 설정 — 크레딧 잔액 + 프로필 편집 + 로그아웃. 프로필 탭의 톱니에서 진입.
export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const c = await (api.get('/api/credits/me').catch(() => null) as Promise<CreditState | null>)
    setCredits(c); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Icon name="close" size={20} color={mono.color.text} /></Pressable>
        <Text style={styles.h1}>설정</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Pressable style={styles.item} onPress={() => router.push('/profile-edit')}>
            <Text style={styles.itemText}>프로필 편집</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Text style={styles.section}>크레딧</Text>
          <View style={styles.card}>
            <Row label="오늘 남은 크레딧" value={credits ? `${credits.remaining} / ${credits.limit}` : '-'} strong />
            <Row label="보너스" value={credits ? `${credits.bonus}` : '-'} />
            <Row label="충전(유상)" value={credits ? `${credits.paid}` : '-'} />
            <View style={styles.divider} />
            <Row label="사용 가능 총량" value={credits ? `${credits.total}` : '-'} strong />
          </View>

          <View style={{ height: 24 }} />
          <Button label="로그아웃" variant="secondary" onPress={logout} />
        </ScrollView>
      )}
    </View>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  h1: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, padding: 16,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  itemText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  chevron: { color: mono.color.textTertiary, fontSize: 22 },
  section: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginTop: 28, marginBottom: 10 },
  card: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, padding: 16,
    borderWidth: 1, borderColor: mono.color.borderSoft, gap: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: mono.color.textSecondary, fontSize: mono.font.body },
  rowValue: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  rowStrong: { color: mono.color.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: mono.color.borderSoft },
})
