import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { Community, CommunityPost } from '@mono/shared'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

const GRAY_AVATAR = '#3E4250'
const GRAY_AVATAR_TEXT = '#A8B0BC'

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '#'
}

// 본문 첫 URL
function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : null
}

// YouTube 링크 → 썸네일 (순수, 네트워크 없음)
function youTubeThumb(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    let vid: string | null = null
    if (u.hostname.includes('youtube.com')) vid = u.searchParams.get('v')
    else if (u.hostname === 'youtu.be') vid = u.pathname.slice(1).split('?')[0]
    return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null
  } catch { return null }
}

// 내 커뮤니티 스토리 — 원형 아바타, 24h 새 글 있으면 바이올렛 링(웹: 그라데이션 링 시맨틱).
export function CommunityStory({ c, onPress }: { c: Community; onPress: () => void }) {
  const hasNew = (c.recentPostCount ?? 0) > 0
  return (
    <Pressable onPress={onPress} style={styles.story}>
      <View style={[styles.storyRing, hasNew ? styles.ringOn : styles.ringOff]}>
        <View style={styles.storyGap}>
          <View style={styles.storyAvatar}>
            {c.avatarImage ? (
              <Image source={{ uri: c.avatarImage }} style={styles.fill} contentFit="cover" />
            ) : (
              <Text style={styles.storyInitial}>{initialOf(c.name)}</Text>
            )}
          </View>
        </View>
      </View>
      <Text style={styles.storyName} numberOfLines={1}>{c.name}</Text>
    </Pressable>
  )
}

// 인기 글 카드 — 16:9 썸네일(첨부 이미지→곡 커버→커뮤니티 커버) + 제목 + 커뮤니티 + 좋아요·댓글.
export function PopularPostCard({ post, width, onPress }: { post: CommunityPost; width: number; onPress: () => void }) {
  const ytThumb = youTubeThumb(post.linkUrl || firstUrl(post.content))
  const thumb = post.imageUrls?.[0] || post.song?.coverImage || ytThumb || post.communityCover || null
  return (
    <Pressable onPress={onPress} style={{ width }}>
      <View style={[styles.postThumb, { height: width * 9 / 16 }]}>
        {thumb ? <Image source={{ uri: thumb }} style={styles.fill} contentFit="cover" transition={150} /> : null}
        <View style={styles.thumbRing} pointerEvents="none" />
      </View>
      <Text style={styles.postTitle} numberOfLines={2}>{post.content?.trim() || '(미디어 글)'}</Text>
      <Text style={styles.postCommunity} numberOfLines={1}>{post.communityName ?? '커뮤니티'}</Text>
      <View style={styles.postStats}>
        <View style={styles.stat}>
          <Icon name="heart" size={12} color={mono.color.textTertiary} />
          <Text style={styles.statText}>{post.likeCount}</Text>
        </View>
        <View style={styles.stat}>
          <Icon name="bubble.left" size={12} color={mono.color.textTertiary} />
          <Text style={styles.statText}>{post.commentCount}</Text>
        </View>
      </View>
    </Pressable>
  )
}

// 커뮤니티 커버 카드(새 커뮤니티) — 16:9 커버 + 하단 아바타·이름·멤버(웹 CommunityCard 파리티).
export function CommunityCoverCard({ c, width, onPress }: { c: Community; width: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width }}>
      <View style={[styles.coverThumb, { height: width * 9 / 16 }]}>
        {c.coverImage ? <Image source={{ uri: c.coverImage }} style={styles.fill} contentFit="cover" transition={150} /> : null}
        <View style={styles.thumbRing} pointerEvents="none" />
      </View>
      <View style={styles.coverFoot}>
        <View style={styles.coverAvatar}>
          {c.avatarImage ? (
            <Image source={{ uri: c.avatarImage }} style={styles.fill} contentFit="cover" />
          ) : (
            <Text style={styles.coverInitial}>{initialOf(c.name)}</Text>
          )}
        </View>
        <View style={styles.coverBody}>
          <Text style={styles.coverName} numberOfLines={1}>{c.name}</Text>
          <Text style={styles.coverMeta} numberOfLines={1}>
            멤버 {c.memberCount.toLocaleString()}{c.recentPostCount ? `  ·  새 글 ${c.recentPostCount}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

// 인기 커뮤니티 순위 행 — 순위(1~3위 바이올렛) + 아바타 + 이름 + 멤버·새 글.
export function CommunityRankRow({ c, rank, onPress }: { c: Community; rank: number; onPress: () => void }) {
  const top = rank <= 3
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.rankRow, pressed && styles.pressed]}>
      <Text style={[styles.rankNum, top && styles.rankTop]}>{rank}</Text>
      <View style={styles.rankAvatar}>
        {c.avatarImage ? (
          <Image source={{ uri: c.avatarImage }} style={styles.fill} contentFit="cover" />
        ) : (
          <Text style={styles.rankInitial}>{initialOf(c.name)}</Text>
        )}
      </View>
      <View style={styles.rankBody}>
        <Text style={styles.rankName} numberOfLines={1}>{c.name}</Text>
        <Text style={styles.rankMeta} numberOfLines={1}>
          멤버 {c.memberCount.toLocaleString()}{c.recentPostCount ? `  ·  새 글 ${c.recentPostCount}` : ''}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: 0.7 },

  // 스토리
  story: { width: 88, alignItems: 'center', gap: 6 },
  storyRing: { width: 88, height: 88, borderRadius: 44, padding: 2.5 },
  ringOn: { backgroundColor: mono.color.accent },
  ringOff: { backgroundColor: mono.color.fillStrong },
  storyGap: { flex: 1, borderRadius: 42, padding: 2.5, backgroundColor: mono.color.bg },
  storyAvatar: {
    flex: 1, borderRadius: 38, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: GRAY_AVATAR,
  },
  storyInitial: { color: GRAY_AVATAR_TEXT, fontSize: 28, fontWeight: '800' },
  storyName: { width: 88, textAlign: 'center', color: mono.color.textSecondary, fontSize: mono.font.small },

  // 인기 글 카드
  postThumb: { width: '100%', borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: '#363A47' },
  thumbRing: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: mono.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  postTitle: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700', marginTop: 9, lineHeight: 21 },
  postCommunity: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 4 },
  postStats: { flexDirection: 'row', gap: 12, marginTop: 7 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { color: mono.color.textTertiary, fontSize: mono.font.small },

  // 커뮤니티 커버 카드
  coverThumb: { width: '100%', borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: '#363A47' },
  coverFoot: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 },
  coverAvatar: {
    width: 36, height: 36, borderRadius: mono.radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: GRAY_AVATAR,
  },
  coverInitial: { color: GRAY_AVATAR_TEXT, fontSize: 15, fontWeight: '800' },
  coverBody: { flex: 1, minWidth: 0 },
  coverName: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  coverMeta: { color: mono.color.textTertiary, fontSize: mono.font.tiny, marginTop: 2 },

  // 순위 행
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  rankNum: { width: 24, textAlign: 'center', color: mono.color.textTertiary, fontSize: mono.font.h2, fontWeight: '800' },
  rankTop: { color: mono.color.accentLight },
  rankAvatar: {
    width: 52, height: 52, borderRadius: mono.radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: GRAY_AVATAR,
  },
  rankInitial: { color: GRAY_AVATAR_TEXT, fontSize: 20, fontWeight: '800' },
  rankBody: { flex: 1, minWidth: 0 },
  rankName: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  rankMeta: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 3 },
})
