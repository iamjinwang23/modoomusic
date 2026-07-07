import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native'
import { mono } from '@/theme/mono'

type Variant = 'primary' | 'secondary'

// MONO 버튼 프리미티브 — 토큰 기반. primary(violet)·secondary(fill).
export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: {
  label: string
  onPress: () => void
  variant?: Variant
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
}) {
  const off = disabled || loading
  const base = variant === 'primary' ? styles.primary : styles.secondary
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [styles.base, base, off && styles.off, pressed && !off && styles.pressed, style]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { borderRadius: mono.radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: mono.color.accent },
  secondary: { backgroundColor: mono.color.fillStrong },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  labelSecondary: { fontWeight: '600' },
})
