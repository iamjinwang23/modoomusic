import { useState } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { LogBox, useColorScheme } from 'react-native';

// 알려진 무해 경고 억제(다른 경고는 유지):
// - track-player 4.1.2 슬립타이머 메서드 시그니처(미사용 기능, 라이브러리 quirk)
// - OAuth 리다이렉트 스킴 'mono'(Supabase에 등록돼 동작 중, app.json 스킴과 별개)
LogBox.ignoreLogs([
  /SleepTimer|sleepWhenActiveTrackReachesEnd/,
  /Linking scheme 'mono'/,
]);

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
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="creator/[username]" />
        <Stack.Screen name="create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="player" options={{ presentation: 'modal' }} />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
        <Stack.Screen name="search" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile-edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="video-create" options={{ presentation: 'modal' }} />
      </Stack>
      {/* 미로그인 & 게스트 아님 → 로그인 오버레이. 라우터는 유지. */}
      {!loading && !session && !guest && <LoginScreen onGuest={() => setGuest(true)} />}
    </ThemeProvider>
  );
}
