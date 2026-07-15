import { useEffect, useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mono } from '@/theme/mono'

// 딤 페이드 + 시트 슬라이드업(분리) — AI가사·댓글 모달과 동일 패턴.
export function BottomSheet({ open, onClose, children, sheetStyle }: {
  open: boolean
  onClose: () => void
  children: ReactNode
  sheetStyle?: StyleProp<ViewStyle>
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [mounted, setMounted] = useState(false)
  const anim = useSharedValue(0)
  useEffect(() => {
    if (open) { setMounted(true); anim.value = withTiming(1, { duration: 240 }) }
    else if (mounted) { anim.value = withTiming(0, { duration: 200 }, (f) => { if (f) runOnJS(setMounted)(false) }) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const dimStyle = useAnimatedStyle(() => ({ opacity: anim.value }))
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(anim.value, [0, 1], [height, 0]) }] }))

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }, slideStyle, sheetStyle]}>
            <View style={styles.handle} />
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  kav: { justifyContent: 'flex-end' },
  sheet: { backgroundColor: mono.color.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: mono.color.fillStrong, marginBottom: 6 },
})
