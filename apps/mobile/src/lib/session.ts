import * as SecureStore from 'expo-secure-store'

// supabase-js Storage 인터페이스를 expo-secure-store로 구현 (세션 토큰 안전 저장)
export const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}
