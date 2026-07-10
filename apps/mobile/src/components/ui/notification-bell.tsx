import { StyleSheet, View } from 'react-native'
import { Icon } from './icon'
import { mono } from '@/theme/mono'
import { useUnreadNotifications } from '@/lib/use-unread-notifications'

// 벨 아이콘 + 미읽음 빨간 점 배지(웹 파리티). Pressable 안에서 Icon 대신 사용.
export function NotificationBell({ size = 18, color = mono.color.text, dotBorder = mono.color.bg }: {
  size?: number
  color?: string
  dotBorder?: string
}) {
  const unread = useUnreadNotifications()
  return (
    <View>
      <Icon name="bell" size={size} color={color} />
      {unread ? <View style={[styles.dot, { borderColor: dotBorder }]} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: 5, backgroundColor: '#ff3b30', borderWidth: 1.5 },
})
