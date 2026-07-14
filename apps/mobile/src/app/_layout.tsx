import { useEffect, useRef } from 'react';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
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
import { useSession } from '@/lib/use-session';
import { configureNotificationHandler, registerForPush, unregisterForPush } from '@/lib/push';

SplashScreen.preventAutoHideAsync();

// 모듈 로드 시 1회 — 알림이 도착하기 전에 포그라운드 핸들러를 설정.
configureNotificationHandler();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session } = useSession();

  // 로그인/로그아웃 전환에 따라 푸시 토큰 등록/해제 (매 렌더가 아닌 전환 시점에만).
  const wasAuthed = useRef(false);
  useEffect(() => {
    if (session && !wasAuthed.current) {
      wasAuthed.current = true;
      registerForPush();
    }
    if (!session && wasAuthed.current) {
      wasAuthed.current = false;
      unregisterForPush();
    }
  }, [session]);

  // 알림 탭 → data.route로 딥링크. 콜드스타트(알림 탭으로 앱이 열린 경우)도 처리.
  useEffect(() => {
    const go = (route?: unknown) => {
      if (typeof route === 'string' && route) router.push(route as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      go(r.notification.request.content.data?.route);
    });
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) go(r.notification.request.content.data?.route);
    });
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* 게스트 기본 시작 — 감상·공개 조회 자유. 로그인 필요한 상호작용은 /login(transparentModal)로 올림. */}
      <AnimatedSplashOverlay />
      {/* 루트 Stack: 탭 그룹(base) + create/player(모달). 모달은 탭·미니플레이어 위로 present. */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="community/[id]" />
        <Stack.Screen name="community-edit/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="community-create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="creator/[username]" />
        <Stack.Screen name="tag/[label]" />
        <Stack.Screen name="create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="player" options={{ presentation: 'modal' }} />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ presentation: 'modal' }} />
        <Stack.Screen name="search" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile-edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="video-create" options={{ presentation: 'modal' }} />
        {/* 로그인 — 투명 모달(다른 모달 위로도 스택). 하단 액션시트 룩 */}
        <Stack.Screen name="login" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      </Stack>
    </ThemeProvider>
  );
}
