import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import { api } from './api'

const TOKEN_KEY = 'expo_push_token'

// 포그라운드에서도 배너·소리 표시
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

// 권한 요청 + Expo 토큰 발급 + 서버 등록. 실기기 아니면 조용히 skip.
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return
    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (existing !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    if (status !== 'granted') return

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) { console.warn('[push] projectId 없음'); return }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
    await api.post('/api/push/subscribe', { platform: 'expo', token })
    await SecureStore.setItemAsync(TOKEN_KEY, token)
  } catch (e) {
    console.warn('[push] register 실패:', (e as Error).message)
  }
}

// 저장된 토큰 서버에서 해제 (로그아웃 시)
export async function unregisterForPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    if (!token) return
    await api.post('/api/push/unsubscribe', { token })
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch (e) {
    console.warn('[push] unregister 실패:', (e as Error).message)
  }
}
