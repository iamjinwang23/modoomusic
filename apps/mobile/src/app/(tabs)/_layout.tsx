import { router, Tabs } from 'expo-router';
import { MiniPlayer } from '@/components/ui/mini-player';
import { mono } from '@/theme/mono';
// 웹 BottomNav와 동일한 MingCute 탭 아이콘 (둘러보기·커뮤니티·만들기·라이브러리·프로필)
import Publish from '@/assets/mingcute/Publish.svg';
import Chat from '@/assets/mingcute/chat.svg';
import AiGenerateMusic from '@/assets/mingcute/Ai-Generate-Music.svg';
import MusicLibrary from '@/assets/mingcute/Music-Library.svg';
import Profile from '@/assets/mingcute/Profile.svg';

// 앱 랜딩 = 둘러보기(웹과 동일)
export const unstable_settings = { initialRouteName: 'discover' };

// 탭 그룹 — 웹 5탭 파리티(JS Tabs). 만들기(중앙)는 탭 화면 대신 create 모달을 바텀에서 올림.
export default function TabsLayout() {
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: mono.color.accent,
          tabBarInactiveTintColor: mono.color.textTertiary,
          tabBarStyle: {
            backgroundColor: mono.color.bg,
            borderTopColor: mono.color.borderSoft,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}>
        <Tabs.Screen
          name="discover"
          options={{ title: '둘러보기', tabBarIcon: ({ color, size }) => <Publish width={size} height={size} color={color} /> }}
        />
        <Tabs.Screen
          name="explore"
          options={{ title: '커뮤니티', tabBarIcon: ({ color, size }) => <Chat width={size} height={size} color={color} /> }}
        />
        <Tabs.Screen
          name="make"
          options={{ title: '만들기', tabBarIcon: ({ color, size }) => <AiGenerateMusic width={size} height={size} color={color} /> }}
          listeners={{ tabPress: (e) => { e.preventDefault(); router.push('/create'); } }}
        />
        <Tabs.Screen
          name="index"
          options={{ title: '라이브러리', tabBarIcon: ({ color, size }) => <MusicLibrary width={size} height={size} color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: '프로필', tabBarIcon: ({ color, size }) => <Profile width={size} height={size} color={color} /> }}
        />
      </Tabs>
      <MiniPlayer />
    </>
  );
}
