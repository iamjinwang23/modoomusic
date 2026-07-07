import AppTabs from '@/components/app-tabs';
import { MiniPlayer } from '@/components/ui/mini-player';

// 탭 그룹 레이아웃 — 네이티브 탭바 + 그 위에 떠 있는 미니플레이어.
// create/player는 이 그룹 밖(루트 Stack 모달)이라 미니플레이어에 안 가림.
export default function TabsLayout() {
  return (
    <>
      <AppTabs />
      <MiniPlayer />
    </>
  );
}
