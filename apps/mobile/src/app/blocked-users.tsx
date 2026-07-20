import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'
import { listBlocked, unblockUser, type BlockedUser } from '@/lib/block'
import { toast } from '@/lib/toast'

// 차단 목록 — 내가 차단한 사용자. 각 항목에서 차단 해제.
export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets()
  const [items, setItems] = useState<BlockedUser[] | null>(null)

  useEffect(() => { listBlocked().then(setItems).catch(() => setItems([])) }, [])

  const unblock = (u: BlockedUser) => {
    Alert.alert('차단을 해제할까요?', `${u.display_name || u.username || '이 사용자'}님의 콘텐츠가 다시 보여요.`, [
      { text: '아니요', style: 'cancel' },
      { text: '차단 해제', onPress: async () => {
        try {
          await unblockUser(u.id)
          setItems((prev) => (prev ?? []).filter((x) => x.id !== u.id))
          toast.info('차단을 해제했어요')
        } catch { toast.error('처리에 실패했어요') }
      } },
    ])
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Icon name="close" size={20} color={mono.color.text} /></Pressable>
        <Text style={styles.h1}>차단 목록</Text>
        <View style={{ width: 22 }} />
      </View>

      {items === null ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>차단한 사용자가 없어요</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item: u }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={styles.avatarImg} contentFit="cover" />
                  : <Text style={styles.avatarText}>{(u.display_name || u.username || '?').charAt(0).toUpperCase()}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{u.display_name || u.username || '알 수 없음'}</Text>
                {u.username ? <Text style={styles.meta} numberOfLines={1}>@{u.username}</Text> : null}
              </View>
              <Pressable style={({ pressed }) => [styles.unblockBtn, pressed && { opacity: 0.7 }]} onPress={() => unblock(u)}>
                <Text style={styles.unblockText}>차단 해제</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  h1: { fontSize: mono.font.h2, fontWeight: '700', color: mono.color.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyText: { color: mono.color.textTertiary, fontSize: mono.font.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.text, fontSize: 18, fontWeight: '700' },
  name: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  meta: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 2 },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: mono.radius.pill, backgroundColor: mono.color.surface, borderWidth: 1, borderColor: mono.color.borderSoft },
  unblockText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
})
