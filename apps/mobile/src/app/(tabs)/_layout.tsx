import { Tabs } from 'expo-router';
import { MiniPlayer } from '@/components/ui/mini-player';
import { mono } from '@/theme/mono';
// 웹 BottomNav와 동일한 MingCute 탭 아이콘
import MusicLibrary from '@/assets/mingcute/Music-Library.svg';
import Publish from '@/assets/mingcute/Publish.svg';
import Chat from '@/assets/mingcute/chat.svg';

// 탭 그룹 — 웹 커스텀 바텀 네비 파리티(JS Tabs). MingCute 아이콘, 바이올렛 액티브.
// 라벨: 둘러보기/커뮤니티(웹과 동일). 미니플레이어는 탭바 위 오버레이.
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
          name="index"
          options={{ title: '라이브러리', tabBarIcon: ({ color, size }) => <MusicLibrary width={size} height={size} color={color} /> }}
        />
        <Tabs.Screen
          name="discover"
          options={{ title: '둘러보기', tabBarIcon: ({ color, size }) => <Publish width={size} height={size} color={color} /> }}
        />
        <Tabs.Screen
          name="explore"
          options={{ title: '커뮤니티', tabBarIcon: ({ color, size }) => <Chat width={size} height={size} color={color} /> }}
        />
      </Tabs>
      <MiniPlayer />
    </>
  );
}
