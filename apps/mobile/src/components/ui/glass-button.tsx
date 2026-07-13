import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { Icon, type IconName } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// expo-blur 네이티브 모듈 감지(구 빌드 폴백)
const BLUR_AVAILABLE = requireOptionalNativeModule('ExpoBlur') != null

// 이미지 위 딤 원형 버튼(글래스) — 배경이 복잡해도 내용 가독성 확보. children 없으면 name 아이콘.
// 커버/아바타 등 이미지 오버레이 컨트롤 공통(내리기·뒤로가기·공유·알림 등).
export function GlassIconButton({ name, size = 36, iconSize = 20, color = mono.color.text, onPress, disabled, style, hitSlop = 8, children }: {
  name?: IconName
  size?: number
  iconSize?: number
  color?: string
  onPress?: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  hitSlop?: number
  children?: ReactNode
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={hitSlop} style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {BLUR_AVAILABLE ? <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={[styles.tint, !BLUR_AVAILABLE && styles.tintSolid]} pointerEvents="none" />
      {children ?? (name ? <Icon name={name} size={iconSize} color={color} /> : null)}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  tintSolid: { backgroundColor: 'rgba(0,0,0,0.45)' },
})
