import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dismissToast, TOAST_DURATION, useToasts, type ToastItem, type ToastType } from '@/lib/toast'
import { Icon, type IconName } from '@/components/ui/icon'
import { hapticNotify } from '@/lib/haptics'
import { mono } from '@/theme/mono'

// 타입별 좌측 아이콘 + 색(초록/노랑/빨강)과 등장 햅틱.
const TYPE_META: Record<ToastType, { icon: IconName; color: string; haptic: 'success' | 'warning' | 'error' }> = {
  success: { icon: 'check.circle.fill', color: '#16A34A', haptic: 'success' },  // 초록
  info: { icon: 'info.circle.fill', color: '#EAB308', haptic: 'warning' },      // 노랑
  error: { icon: 'forbid.circle.fill', color: '#DC2626', haptic: 'error' },     // 빨강
}

function Row({ item }: { item: ToastItem }) {
  const meta = TYPE_META[item.type]
  useEffect(() => {
    hapticNotify(meta.haptic)  // 스낵바 등장 시 타입별 햅틱
    const t = setTimeout(() => dismissToast(item.id), item.duration ?? TOAST_DURATION[item.type])
    return () => clearTimeout(t)
  }, [item.id, item.duration, item.type, meta.haptic])

  return (
    <Animated.View entering={FadeInDown.duration(200).easing(Easing.out(Easing.cubic))} exiting={FadeOutDown.duration(150)} layout={LinearTransition.duration(180)}>
      <Pressable style={styles.toast} onPress={() => dismissToast(item.id)}>
        <Icon name={meta.icon} size={20} color={meta.color} />
        <View style={styles.body}>
          <Text style={styles.msg} numberOfLines={2}>{item.message}</Text>
          {item.description ? <Text style={styles.desc} numberOfLines={2}>{item.description}</Text> : null}
        </View>
        {item.action ? (
          <Pressable onPress={() => { item.action!.onPress(); dismissToast(item.id) }} hitSlop={8} style={styles.action}>
            <Text style={styles.actionText}>{item.action.label}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

// 전역 스낵바 호스트 — 루트에 1회 마운트. 미니플레이어·탭바 위, 하단 정렬.
export function ToastHost() {
  const items = useToasts()
  const insets = useSafeAreaInsets()
  if (items.length === 0) return null
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: insets.bottom + 76 }]}>
      {items.map((it) => <Row key={it.id} item={it} />)}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 8, zIndex: 9999 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#ededed', borderRadius: mono.radius.md,
    paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden',
    boxShadow: '0px 6px 18px rgba(0,0,0,0.4)', elevation: 8,
  },
  body: { flex: 1, minWidth: 0 },
  msg: { color: '#111318', fontSize: mono.font.body, fontWeight: '600' },
  desc: { color: 'rgba(17,19,24,0.6)', fontSize: mono.font.small, marginTop: 2 },
  action: { paddingHorizontal: 4 },
  actionText: { color: mono.color.accent, fontSize: mono.font.small, fontWeight: '800' },
})
