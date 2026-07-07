import { createApiClient } from '@mono/shared'
import { supabase } from './supabase'

// 공용 BFF 호출 — 현재 세션 access_token을 Bearer로 자동 첨부(웹/앱 동일 API 재사용)
export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
})
