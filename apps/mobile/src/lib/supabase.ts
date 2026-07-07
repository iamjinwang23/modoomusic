import { createClient } from '@supabase/supabase-js'
import { secureStorage } from './session'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // RN엔 URL 세션 없음
    },
  },
)
