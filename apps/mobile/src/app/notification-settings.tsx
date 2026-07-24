import { Fragment, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { PUSH_CATEGORIES, PUSH_CATEGORY_LABELS, type PushCategory } from '@mono/shared'
import { api } from '@/lib/api'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 알림 설정 — 설정에서 뎁스 진입. '전체 알림' 마스터 + 개별 항목. 마스터 끄면 개별값 유지한 채 전부 비활성.
const CELL = 54

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets()
  const [prefs, setPrefs] = useState<Record<PushCategory, boolean> | null>(null)
  const [master, setMaster] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/notifications/preferences')
      .then((j) => {
        const d = j as { preferences: Record<PushCategory, boolean>; pushEnabled?: boolean }
        setPrefs(d.preferences); setMaster(d.pushEnabled !== false)
      })
      .catch(() => setPrefs(null))
      .finally(() => setLoading(false))
  }, [])

  const toggleCategory = async (c: PushCategory, v: boolean) => {
    setPrefs((p) => (p ? { ...p, [c]: v } : p))
    try { await api.post('/api/notifications/preferences', { category: c, enabled: v }) }
    catch { setPrefs((p) => (p ? { ...p, [c]: !v } : p)) }
  }
  const toggleMaster = async (v: boolean) => {
    setMaster(v)
    try { await api.post('/api/notifications/preferences', { category: 'push_enabled', enabled: v }) }
    catch { setMaster(!v) }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Icon name="close" size={20} color={mono.color.text} /></Pressable>
        <Text style={styles.h1}>알림 설정</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {/* 전체 알림 마스터 */}
          <View style={[styles.group, { marginTop: 8 }]}>
            <View style={styles.cell}>
              <Text style={styles.cellText}>전체 알림</Text>
              <Switch
                style={styles.sw}
                value={master}
                onValueChange={toggleMaster}
                trackColor={{ false: mono.color.fillStrong, true: mono.color.accent }}
                ios_backgroundColor={mono.color.fillStrong}
                thumbColor="#ffffff"
              />
            </View>
          </View>
          <Text style={styles.hint}>전체 알림을 끄면 아래 모든 알림이 발송되지 않아요.</Text>

          {/* 개별 항목 — 마스터 off 시 비활성(값은 유지) */}
          {prefs && (
            <>
              <Text style={styles.section}>알림 항목</Text>
              <View style={[styles.group, !master && styles.groupDisabled]}>
                {PUSH_CATEGORIES.map((c, i) => (
                  <Fragment key={c}>
                    <View style={styles.cell}>
                      <Text style={[styles.cellText, !master && styles.textDisabled]}>{PUSH_CATEGORY_LABELS[c]}</Text>
                      <Switch
                        style={styles.sw}
                        value={master && prefs[c]}
                        disabled={!master}
                        onValueChange={(v) => toggleCategory(c, v)}
                        trackColor={{ false: mono.color.fillStrong, true: mono.color.accent }}
                        ios_backgroundColor={mono.color.fillStrong}
                        thumbColor="#ffffff"
                      />
                    </View>
                    {i < PUSH_CATEGORIES.length - 1 && <View style={styles.divider} />}
                  </Fragment>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  h1: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  section: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginTop: 28, marginBottom: 10 },
  hint: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 8, marginLeft: 4 },
  group: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  groupDisabled: { opacity: 0.5 },
  cell: {
    height: CELL, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  cellText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '500' },
  sw: { alignSelf: 'center' },
  textDisabled: { color: mono.color.textTertiary },
  divider: { height: 1, backgroundColor: mono.color.borderSoft },
})
