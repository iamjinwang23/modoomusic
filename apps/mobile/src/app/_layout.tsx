import { useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { LoginScreen } from '@/components/login-screen';
import { useSession } from '@/lib/use-session';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useSession();
  // 게스트 둘러보기 — 커뮤니티는 공개 읽기라 로그인 없이 탐색 가능(소셜 로그인은 Phase4).
  const [guest, setGuest] = useState(false);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
      {/* 미로그인 & 게스트 아님 → 로그인 오버레이. 라우터는 유지. */}
      {!loading && !session && !guest && <LoginScreen onGuest={() => setGuest(true)} />}
    </ThemeProvider>
  );
}
