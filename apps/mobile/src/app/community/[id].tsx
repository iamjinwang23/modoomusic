import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import type { Community, CommunityMember, CommunityPost } from '@mono/shared'
import { api } from '@/lib/api'
import { setSelectedPost } from '@/lib/selected-post'
import { shareCommunity } from '@/lib/song-actions'
import { CollapsingHeader, HEADER_ROW } from '@/components/ui/collapsing-header'
import { CoverScrim } from '@/components/ui/profile-grid'
import { PostCard } from '@/components/ui/post-card'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 커뮤니티 상세 — 배너/이름/멤버 + 게시글 피드(GET /api/communities/[id], /posts).
export default function CommunityDetailScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  const { id } = useLocalSearchParams<{ id: string }>()
  const [community, setCommunity] = useState<Community | null>(null)
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [descLines, setDescLines] = useState(0)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    try {
      const [detail, feed] = await Promise.all([
        api.get(`/api/communities/${id}`) as Promise<{ community?: Community; members?: CommunityMember[] }>,
        api.get(`/api/communities/${id}/posts`) as Promise<{ posts?: CommunityPost[] }>,
      ])
      setCommunity(detail.community ?? null)
      setMembers(detail.members ?? [])
      setPosts(feed.posts ?? [])
    } catch (e) {
      setError((e as { error?: string })?.error ?? 'network_error')
      setPosts([])
    }
  }, [id])

  useEffect(() => { load() }, [load])
  // compose 모달에서 글 작성 후 돌아오면 피드 갱신
  useFocusEffect(useCallback(() => { if (community) load() }, [community, load]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false)
  }, [load])

  // 가입/탈퇴 — 낙관적 토글 후 서버 반영. 매니저는 탈퇴 불가(서버 가드).
  const toggleJoin = useCallback(async () => {
    if (!id || !community || joinBusy) return
    const next = !community.isMember
    setJoinBusy(true)
    setCommunity({ ...community, isMember: next, memberCount: community.memberCount + (next ? 1 : -1) })
    try {
      await api.post(`/api/communities/${id}/${next ? 'join' : 'leave'}`)
    } catch {
      setCommunity((c) => (c ? { ...c, isMember: !next, memberCount: c.memberCount + (next ? -1 : 1) } : c))
    } finally {
      setJoinBusy(false)
    }
  }, [id, community, joinBusy])

  const banner = community?.coverImage
  const initial = (community?.name ?? '?').trim().charAt(0).toUpperCase() || '?'
  // 커버(16:9) + 이름이 헤더 아래로 사라질 즈음 페이드인
  const coverH = width * 9 / 16
  const fadeEnd = Math.max(coverH - (insets.top + HEADER_ROW), 60)
  const fadeStart = Math.max(fadeEnd - 70, 0)

  return (
    <View style={styles.container}>
      <CollapsingHeader
        scrollY={scrollY}
        fadeStart={fadeStart}
        fadeEnd={fadeEnd}
        title={community?.name ?? '커뮤니티'}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.hBack}><Icon name="arrow.left" size={24} color={mono.color.text} /></Pressable>
        }
        right={
          <>
            <Pressable onPress={() => router.push('/notifications')} hitSlop={8} style={styles.hIconBtn}><Icon name="bell" size={20} color={mono.color.text} /></Pressable>
            <Pressable onPress={() => id && shareCommunity(id, community?.name)} hitSlop={8} style={styles.hIconBtn}><Icon name="square.and.arrow.up" size={20} color={mono.color.text} /></Pressable>
          </>
        }
      />
      <Animated.FlatList
        data={posts ?? []}
        keyExtractor={(p) => p.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            managerId={community?.managerId}
            onChanged={load}
            onPress={() => { setSelectedPost(item); router.push(`/post/${item.id}`) }}
            onAuthorPress={item.authorUsername ? () => router.push(`/creator/${item.authorUsername}`) : undefined}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.bannerWrap}>
              {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.bannerFallback]} />}
              <CoverScrim />
              <Pressable onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10}>
                <Icon name="arrow.left" size={22} color={mono.color.onMedia} />
              </Pressable>
              {/* 우상단 — (매니저)수정 · 알림 · 공유 */}
              <View style={[styles.coverActions, { top: insets.top + 8 }]}>
                {community?.isManager ? (
                  <Pressable onPress={() => router.push(`/community-edit/${id}`)} style={styles.editPill} hitSlop={8}>
                    <Text style={styles.editText}>수정</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => router.push('/notifications')} style={styles.circleBtn} hitSlop={8}>
                  <Icon name="bell" size={18} color={mono.color.onMedia} />
                </Pressable>
                <Pressable onPress={() => id && shareCommunity(id, community?.name)} style={styles.circleBtn} hitSlop={8}>
                  <Icon name="square.and.arrow.up" size={18} color={mono.color.onMedia} />
                </Pressable>
              </View>
            </View>

            {/* 타이틀 행 — 사각 대표 이미지 + 이름 + 멤버(카운트·아바타) */}
            <View style={styles.titleRow}>
              <View style={styles.cAvatar}>
                {community?.avatarImage ? <Image source={{ uri: community.avatarImage }} style={styles.fill} contentFit="cover" /> : <Text style={styles.cAvatarText}>{initial}</Text>}
              </View>
              <View style={styles.titleCol}>
                <Text style={styles.name} numberOfLines={1}>{community?.name ?? '커뮤니티'}</Text>
                <View style={styles.memberRow}>
                  <Text style={styles.meta}>멤버 {community?.memberCount?.toLocaleString() ?? '-'}</Text>
                  {members.length > 0 ? (
                    <View style={styles.avatarStack}>
                      {members.slice(0, 5).map((m, i) => (
                        <View key={m.userId} style={[styles.mAvatar, { marginLeft: i === 0 ? 0 : -8, backgroundColor: `hsl(${m.avatarHue ?? 250}, 40%, 40%)` }]}>
                          {m.avatarUrl ? <Image source={{ uri: m.avatarUrl }} style={styles.fill} contentFit="cover" /> : <Text style={styles.mAvatarText}>{(m.displayName ?? m.username ?? '?').charAt(0).toUpperCase()}</Text>}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {community?.description ? (
              <View style={styles.descWrap}>
                <Text style={styles.desc} numberOfLines={descExpanded ? undefined : 2}>{community.description}</Text>
                {/* 전체 라인 수 측정(숨김) */}
                <Text style={[styles.desc, styles.descMeasure]} onTextLayout={(e) => setDescLines(e.nativeEvent.lines.length)}>{community.description}</Text>
                {descLines > 2 ? (
                  <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={6}>
                    <Text style={styles.moreBtn}>{descExpanded ? '접기' : '...더보기'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {community?.topic ? <View style={styles.topicWrap}><Text style={styles.topic}>{community.topic}</Text></View> : null}

            {/* 매니저(내 커뮤니티)는 가입/탈퇴 없음. 멤버=탈퇴하기, 비멤버=가입하기(웹 파리티) */}
            {community && !community.isManager ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={toggleJoin}
                  disabled={joinBusy}
                  style={[styles.joinBtn, community.isMember ? styles.leaveBtn : styles.joinBtnOff, joinBusy && styles.dim]}
                >
                  <Text style={[styles.joinText, community.isMember && styles.leaveText]}>
                    {community.isMember ? '탈퇴하기' : '가입하기'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.feedLabel}>게시글</Text>
          </View>
        }
        ListEmptyComponent={
          posts === null && !error ? (
            <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
          ) : (
            <Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '아직 게시글이 없어요'}</Text>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {/* 글쓰기 — 우측 하단 플로팅(+) 버튼(멤버만) */}
      {community?.isMember ? (
        <Pressable onPress={() => router.push(`/compose?communityId=${id}`)} style={[styles.fab, { bottom: insets.bottom + 20 }]}>
          <Icon name="plus" size={26} color={mono.color.bg} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  header: { marginHorizontal: -16, marginBottom: 12 },
  // 커버 — 16:9(프로필과 동일), 하단 그라데이션 디졸브(CoverScrim)
  bannerWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: mono.color.surface2, overflow: 'hidden' },
  bannerFallback: { backgroundColor: mono.color.surface },
  coverActions: { position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.overlay, alignItems: 'center', justifyContent: 'center' },
  editPill: { paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: mono.color.overlay, alignItems: 'center', justifyContent: 'center' },
  editText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '600' },
  back: {
    position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18,
    backgroundColor: mono.color.overlay, alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: mono.color.onMedia, fontSize: 26, lineHeight: 28, marginTop: -2 },
  fill: { width: '100%', height: '100%' },
  // 타이틀 행 — 사각 대표 이미지 + 이름 + 멤버. 커버와 살짝 겹치게 위로 당김.
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -30, paddingHorizontal: 16 },
  cAvatar: {
    width: 68, height: 68, borderRadius: mono.radius.lg, overflow: 'hidden',
    backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: mono.color.bg,
  },
  cAvatarText: { color: mono.color.accentLight, fontSize: 26, fontWeight: '800' },
  titleCol: { flex: 1, minWidth: 0 },
  name: {
    color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  meta: { color: mono.color.textTertiary, fontSize: mono.font.small },
  avatarStack: { flexDirection: 'row' },
  mAvatar: {
    width: 24, height: 24, borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: mono.color.bg, alignItems: 'center', justifyContent: 'center',
  },
  mAvatarText: { color: mono.color.onMedia, fontSize: 10, fontWeight: '700' },
  descWrap: { marginTop: 12, paddingHorizontal: 16 },
  desc: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 20 },
  descMeasure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  moreBtn: { color: mono.color.textTertiary, fontSize: mono.font.small, fontWeight: '600', marginTop: 4 },
  topicWrap: { marginTop: 12, paddingHorizontal: 16, flexDirection: 'row' },
  topic: {
    color: mono.color.accentLight, fontSize: mono.font.small, fontWeight: '700',
    backgroundColor: 'rgba(124,58,237,0.15)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: mono.radius.pill, overflow: 'hidden',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, paddingHorizontal: 16 },
  joinBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: mono.radius.pill },
  joinBtnOff: { backgroundColor: mono.color.accent },
  leaveBtn: { backgroundColor: mono.color.fillStrong },
  dim: { opacity: 0.5 },
  joinText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  leaveText: { color: mono.color.textSecondary },
  // 스크롤 헤더 내 뒤로가기·아이콘(공유·알림)
  hBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // 글쓰기 플로팅 버튼(우측 하단)
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 2px 8px rgba(0,0,0,0.2)', elevation: 3,
  },
  feedLabel: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginTop: 20, paddingHorizontal: 16 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 32 },
})
