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
  // 우상단 빨간 점 — 아이콘과 안 겹치게 바깥으로 띄움(보더 없음).
  dot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
