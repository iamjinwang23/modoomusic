import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { mono } from '@/theme/mono'

interface CreditState { used: number; limit: number; remaining: number; bonus: number; paid: number; total: number }
interface Profile { username: string | null; display_name: string | null; avatar_url: string | null }

// 프로필 — 계정 정보 + 크레딧 잔액 + 로그아웃. 라이브러리 헤더에서 진입.
export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setEmail(user?.email ?? null)
    const [{ data: prof }, creditRes] = await Promise.all([
      user
        ? supabase.from('profiles').select('username, display_name, avatar_url').eq('id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      api.get('/api/credits/me').catch(() => null) as Promise<CreditState | null>,
    ])
    setProfile((prof as Profile) ?? null)
    setCredits(creditRes)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const name = profile?.display_name ?? profile?.username ?? '내 계정'
  const initial = (name.trim().charAt(0) || '?').toUpperCase()

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        <Text style={styles.h1}>프로필</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={styles.account}>
            <View style={styles.avatar}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <Text style={styles.name}>{name}</Text>
            {profile?.username ? <Text style={styles.handle}>@{profile.username}</Text> : null}
            {email ? <Text style={styles.email}>{email}</Text> : null}
          </View>

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  close: { color: mono.color.text, fontSize: 22, width: 24 },
  h1: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  account: { alignItems: 'center', gap: 4, marginTop: 20, marginBottom: 8 },
  avatar: {
    width: 84, height: 84, borderRadius: 42, overflow: 'hidden', marginBottom: 8,
    backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.accentLight, fontSize: 34, fontWeight: '800' },
  name: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '800' },
  handle: { color: mono.color.accentLight, fontSize: mono.font.small },
  email: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
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
