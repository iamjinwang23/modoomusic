import { useState } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LoginScreen } from '@/components/login-screen';
import { useSession } from '@/lib/use-session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useSession();
  // 게스트 둘러보기 — 커뮤니티는 공개 읽기라 로그인 없이 탐색 가능.
  const [guest, setGuest] = useState(false);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* 루트 Stack: 탭 그룹(base) + create/player(모달). 모달은 탭·미니플레이어 위로 present. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="community/[id]" />
        <Stack.Screen name="create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="player" options={{ presentation: 'modal' }} />
      </Stack>
      {/* 미로그인 & 게스트 아님 → 로그인 오버레이. 라우터는 유지. */}
      {!loading && !session && !guest && <LoginScreen onGuest={() => setGuest(true)} />}
    </ThemeProvider>
  );
}
