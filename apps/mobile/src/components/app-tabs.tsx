import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { mono } from '@/theme/mono';

// 탭바 — MONO 토큰. 선택 틴트 = 바이올렛 액센트(아이콘·라벨), 배경/인디케이터도 토큰.
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={mono.color.bg}
      tintColor={mono.color.accent}
      indicatorColor={mono.color.surface}
      labelStyle={{ selected: { color: mono.color.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>라이브러리</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="discover">
        <NativeTabs.Trigger.Label>탐색</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>커뮤니티</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
