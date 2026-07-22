import { router, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/components/ui/mini-player';
import { GlassSurface, GLASS_AVAILABLE } from '@/components/ui/glass-surface';
import { useAuthGate } from '@/lib/auth-gate';
import { mono } from '@/theme/mono';
// 웹 BottomNav와 동일한 MingCute 탭 아이콘 (둘러보기·커뮤니티·만들기·라이브러리·프로필)
import Publish from '@/assets/mingcute/Publish.svg';
import Chat from '@/assets/mingcute/chat.svg';
import AiGenerateMusic from '@/assets/mingcute/Ai-Generate-Music.svg';
import MusicLibrary from '@/assets/mingcute/Music-Library.svg';
import Profile from '@/assets/mingcute/Profile.svg';

// 앱 랜딩 = 둘러보기(index, 웹과 동일). 라이브러리는 /library로 분리.
export const unstable_settings = { initialRouteName: 'index' };

// 탭 아이콘 크기(기본보다 살짝 큼)
const TAB_ICON = 27;

// 탭 그룹 — 웹 5탭 파리티(JS Tabs). 만들기(중앙)는 탭 화면 대신 create 모달을 바텀에서 올림.
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { requireAuth } = useAuthGate();
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: mono.color.text,
          tabBarInactiveTintColor: mono.color.textTertiary,
          // 풀폭 글라스 탭바 — iOS26 Liquid Glass / 이하 BlurView. 콘텐츠가 밑으로 비침. 미니플레이어와 동일 표면.
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: GLASS_AVAILABLE ? 'transparent' : mono.color.bg,
            borderTopColor: 'rgba(255,255,255,0.08)',
            borderTopWidth: StyleSheet.hairlineWidth,
            elevation: 0,
            height: 62 + insets.bottom,
            paddingTop: 9,
            paddingBottom: insets.bottom > 0 ? insets.bottom - 4 : 8,
          },
          tabBarBackground: GLASS_AVAILABLE ? () => <GlassSurface preferBlur tint="rgba(16,18,24,0.8)" /> : undefined,
          tabBarIconStyle: { marginBottom: 1 },
          tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' },
        }}>
        <Tabs.Screen
          name="index"
          options={{ title: '둘러보기', tabBarIcon: ({ color }) => <Publish width={TAB_ICON} height={TAB_ICON} color={color} /> }}
        />
        <Tabs.Screen
          name="explore"
          options={{ title: '커뮤니티', tabBarIcon: ({ color }) => <Chat width={TAB_ICON} height={TAB_ICON} color={color} /> }}
        />
        <Tabs.Screen
          name="make"
          options={{ title: '만들기', tabBarIcon: ({ color }) => <AiGenerateMusic width={TAB_ICON} height={TAB_ICON} color={color} /> }}
          listeners={{ tabPress: (e) => { e.preventDefault(); if (requireAuth()) router.push('/create'); } }}
        />
        <Tabs.Screen
          name="library"
          options={{ title: '라이브러리', tabBarIcon: ({ color }) => <MusicLibrary width={TAB_ICON} height={TAB_ICON} color={color} /> }}
          listeners={{ tabPress: (e) => { if (!requireAuth()) e.preventDefault(); } }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: '프로필', tabBarIcon: ({ color }) => <Profile width={TAB_ICON} height={TAB_ICON} color={color} /> }}
          listeners={{ tabPress: (e) => { if (!requireAuth()) e.preventDefault(); } }}
        />
      </Tabs>
      <MiniPlayer />
    </>
  );
}
