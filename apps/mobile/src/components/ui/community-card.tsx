import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { Community } from '@mono/shared'
import { mono } from '@/theme/mono'

// 커뮤니티 카드 — 아바타/이름/설명/멤버·새글 수. 웹 커뮤니티 목록 파리티.
export function CommunityCard({ community, onPress }: { community: Community; onPress?: () => void }) {
  const avatar = community.avatarImage ?? community.coverImage
  const initial = community.name.trim().charAt(0) || '#'
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.avatar}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.avatarText}>{initial}</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{community.name}</Text>
        {community.description ? (
          <Text style={styles.desc} numberOfLines={1}>{community.description}</Text>
        ) : null}
        <Text style={styles.meta}>
          멤버 {community.memberCount.toLocaleString()}
          {community.recentPostCount ? `  ·  새 글 ${community.recentPostCount}` : ''}
        </Text>
      </View>
      {community.isMember ? <View style={styles.joined}><Text style={styles.joinedText}>가입됨</Text></View> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, padding: 12,
    borderWidth: 1, borderColor: mono.color.borderSoft, marginBottom: 10,
  },
  pressed: { opacity: 0.85 },
  avatar: {
    width: 52, height: 52, borderRadius: mono.radius.md, overflow: 'hidden',
    backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.accentLight, fontSize: 22, fontWeight: '800' },
  body: { flex: 1, gap: 2 },
  name: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  desc: { color: mono.color.textSecondary, fontSize: mono.font.small },
  meta: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 2 },
  joined: {
    backgroundColor: mono.color.fillStrong, borderRadius: mono.radius.pill,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  joinedText: { color: mono.color.accentLight, fontSize: mono.font.tiny, fontWeight: '700' },
})
