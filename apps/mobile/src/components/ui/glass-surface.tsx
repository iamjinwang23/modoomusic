import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { mono } from '@/theme/mono'

// iOS 26+ Liquid Glass 지원 감지(네이티브 모듈은 스켈레톤부터 포함 → Build 14도 보유. try 가드).
const LIQUID = (() => { try { return isLiquidGlassAvailable() } catch { return false } })()
// expo-blur 네이티브 모듈 감지(구 dev 빌드 폴백)
const BLUR = requireOptionalNativeModule('ExpoBlur') != null

// 배경을 투명으로 둬도 글라스 표면이 채우는지(아니면 호출부는 솔리드 배경 유지)
export const GLASS_AVAILABLE = LIQUID || BLUR

// 글래스 표면 — iOS26 Liquid Glass(GlassView) 우선, 그 이하 BlurView, 둘 다 없으면 솔리드.
// absoluteFill로 부모(탭바·미니플레이어 등) 배경에 깔아 씀. style로 borderRadius 전달 시 라운드.
// glassStyle: 'clear'(투명·맑음, 떠있는 캡슐용) / 'regular'(대비 보정).
export function GlassSurface({ style, tint = 'rgba(16,18,24,0.6)', glassStyle = 'regular', preferBlur = false }: {
  style?: StyleProp<ViewStyle>
  tint?: string
  glassStyle?: 'regular' | 'clear'
  preferBlur?: boolean  // true면 iOS26라도 GlassView 대신 프로스티드 BlurView 사용(더 어둡고 은은한 톤)
}) {
  if (LIQUID && !preferBlur) {
    return <GlassView glassEffectStyle={glassStyle} colorScheme="dark" style={[StyleSheet.absoluteFill, style]} />
  }
  if (BLUR) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.clip, style]} pointerEvents="none">
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      </View>
    )
  }
  return <View style={[StyleSheet.absoluteFill, styles.clip, style, { backgroundColor: mono.color.surface2 }]} pointerEvents="none" />
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
})
