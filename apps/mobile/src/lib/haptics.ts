import * as Haptics from 'expo-haptics'

// 당겨서 새로고침 등 가벼운 피드백. 네이티브 미지원/실패 시 조용히 무시.
export function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}
