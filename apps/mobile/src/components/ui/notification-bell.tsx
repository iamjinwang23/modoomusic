import { StyleSheet, View } from 'react-native'
import { Icon } from './icon'
import { mono } from '@/theme/mono'
import { useUnreadNotifications } from '@/lib/use-unread-notifications'

// 벨 아이콘 + 미읽음 빨간 점. 아이콘이 작아도 티나게, 우상단에 별도 배지로 표시(배경색 링으로 분리).
export function NotificationBell({ size = 18, color = mono.color.text, dotColor = '#ff3b30' }: {
  size?: number
  color?: string
  dotColor?: string
}) {
  const unread = useUnreadNotifications()
  return (
    <View>
      <Icon name="bell" size={size} color={color} />
      {unread ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // 우상단 빨간 점 — 배경색 링으로 아이콘과 분리해 또렷하게.
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: mono.color.bg,
  },
})
