import * as Haptics from 'expo-haptics'

// 당겨서 새로고침 등 가벼운 피드백. 네이티브 미지원/실패 시 조용히 무시.
export function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

// 스낵바 등장 등 타입별 알림 햅틱. 네이티브 미지원/실패 시 조용히 무시.
export function hapticNotify(type: 'success' | 'warning' | 'error') {
  const map = {
    success: Haptics.NotificationFeedbackType.Success,
    warning: Haptics.NotificationFeedbackType.Warning,
    error: Haptics.NotificationFeedbackType.Error,
  }
  Haptics.notificationAsync(map[type]).catch(() => {})
}
