import { Pressable, StyleSheet, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import Svg, { Path, Rect, Circle } from 'react-native-svg'
import type { SocialLinks } from '@mono/shared'
import { mono } from '@/theme/mono'

// 웹 SocialLinksRow 파리티 — 프로필 SNS 링크를 원형 아이콘 버튼 행으로. 탭 시 인앱 브라우저로 열기.
type Key = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'x'
const ORDER: Key[] = ['instagram', 'tiktok', 'youtube', 'facebook', 'x']

function Glyph({ kind, color }: { kind: Key; color: string }) {
  const p = { width: 19, height: 19, viewBox: '0 0 24 24' } as const
  switch (kind) {
    case 'instagram':
      return (
        <Svg {...p} fill="none">
          <Rect x="3" y="3" width="18" height="18" rx="5" stroke={color} strokeWidth={1.8} />
          <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={1.8} />
          <Circle cx="17.5" cy="6.5" r="1.1" fill={color} />
        </Svg>
      )
    case 'tiktok':
      return <Svg {...p}><Path fill={color} d="M14 3h2.6a5.4 5.4 0 0 0 4.4 4.4V10a8 8 0 0 1-4.4-1.32V15a6 6 0 1 1-6-6c.34 0 .68.03 1 .09v2.7A3.3 3.3 0 1 0 14 15Z" /></Svg>
    case 'youtube':
      return <Svg {...p}><Path fill={color} d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" /></Svg>
    case 'facebook':
      return <Svg {...p}><Path fill={color} d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.7c0-.93.26-1.56 1.6-1.56h1.7V4.3c-.3-.04-1.3-.13-2.46-.13-2.44 0-4.1 1.49-4.1 4.22v2.4H7.5V14h2.74v8h3.26Z" /></Svg>
    case 'x':
      return <Svg {...p}><Path fill={color} d="M18.2 3h2.93l-6.4 7.31L22 21h-5.78l-4.52-5.92L6.5 21H3.56l6.84-7.82L3 3h5.9l4.08 5.4L18.2 3Zm-1.02 16.2h1.62L7.94 4.7H6.2L17.18 19.2Z" /></Svg>
  }
}

export function SocialLinksRow({ links }: { links?: SocialLinks | null }) {
  if (!links) return null
  const items = ORDER.filter((k) => !!links[k])
  if (items.length === 0) return null
  return (
    <View style={styles.row}>
      {items.map((k) => (
        <Pressable
          key={k}
          onPress={() => WebBrowser.openBrowserAsync(links[k]!).catch(() => {})}
          hitSlop={6}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Glyph kind={k} color={mono.color.text} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  btn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  btnPressed: { backgroundColor: 'rgba(255,255,255,0.16)', transform: [{ scale: 0.94 }] },
})
