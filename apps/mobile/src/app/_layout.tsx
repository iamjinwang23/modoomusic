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

import type { Song } from '@mono/shared';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ToastHost } from '@/components/ui/toast-host';
import { useSession } from '@/lib/use-session';
import { configureNotificationHandler, registerForPush, unregisterForPush } from '@/lib/push';
import { api } from '@/lib/api';
import { playSong } from '@/lib/player';
import type { NowPlaying } from '@/lib/now-playing';

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

  // 알림 탭 처리. 콜드스타트(알림 탭으로 앱이 열린 경우)도 처리.
  // - data.songId가 있으면(곡·영상 완성) 그 곡을 재생하며 플레이어를 연다(인앱 알림 목록과 동일 동작).
  // - 없으면 data.route로 딥링크 이동.
  useEffect(() => {
    const handle = async (data: Record<string, unknown> | undefined) => {
      const songId = typeof data?.songId === 'string' ? data.songId : null;
      if (songId) {
        try {
          const j = (await api.get(`/api/songs/${songId}`)) as { song?: Song };
          if (j.song?.audioUrl) {
            await playSong(j.song as NowPlaying);
            router.push('/player');
            return;
          }
        } catch { /* 곡 삭제 등 — 아래 route 폴백 */ }
      }
      const route = data?.route;
      if (typeof route === 'string' && route) router.push(route as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handle(r.notification.request.content.data as Record<string, unknown> | undefined);
    });
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) handle(r.notification.request.content.data as Record<string, unknown> | undefined);
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
        <Stack.Screen name="credit-purchase" options={{ presentation: 'modal' }} />
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
        <Stack.Screen name="blocked-users" options={{ presentation: 'modal' }} />
        <Stack.Screen name="video-create" options={{ presentation: 'modal' }} />
        {/* 로그인 — 투명 모달(다른 모달 위로도 스택). 하단 액션시트 룩 */}
        <Stack.Screen name="login" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      </Stack>
      <ToastHost />
    </ThemeProvider>
  );
}
