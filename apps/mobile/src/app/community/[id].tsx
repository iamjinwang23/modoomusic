import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import type { Community, CommunityPost } from '@mono/shared'
import { api } from '@/lib/api'
import { setSelectedPost } from '@/lib/selected-post'
import { CollapsingHeader, HEADER_ROW } from '@/components/ui/collapsing-header'
import { PostCard } from '@/components/ui/post-card'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 커뮤니티 상세 — 배너/이름/멤버 + 게시글 피드(GET /api/communities/[id], /posts).
export default function CommunityDetailScreen() {
  const insets = useSafeAreaInsets()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  const { id } = useLocalSearchParams<{ id: string }>()
  const [community, setCommunity] = useState<Community | null>(null)
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    try {
      const [detail, feed] = await Promise.all([
        api.get(`/api/communities/${id}`) as Promise<{ community?: Community }>,
        api.get(`/api/communities/${id}/posts`) as Promise<{ posts?: CommunityPost[] }>,
      ])
      setCommunity(detail.community ?? null)
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

  const banner = community?.coverImage ?? community?.avatarImage
  // 배너(160) + 이름이 헤더 아래로 사라질 즈음 페이드인
  const fadeEnd = Math.max(160 + 20 - (insets.top + HEADER_ROW), 40)
  const fadeStart = Math.max(fadeEnd - 60, 0)

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
        right={community ? (
          <Pressable onPress={toggleJoin} disabled={joinBusy} style={[styles.hJoin, community.isMember && styles.hJoinOn, joinBusy && styles.dim]} hitSlop={8}>
            <Text style={[styles.hJoinText, community.isMember && styles.hJoinTextOn]}>{community.isMember ? '가입됨' : '가입'}</Text>
          </Pressable>
        ) : undefined}
      />
      <Animated.FlatList
        data={posts ?? []}
        keyExtractor={(p) => p.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => { setSelectedPost(item); router.push(`/post/${item.id}`) }}
            onAuthorPress={item.authorUsername ? () => router.push(`/creator/${item.authorUsername}`) : undefined}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.bannerWrap}>
              {banner ? <Image source={{ uri: banner }} style={styles.banner} contentFit="cover" /> : <View style={[styles.banner, styles.bannerFallback]} />}
              <Pressable onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10}>
                <Icon name="arrow.left" size={22} color={mono.color.onMedia} />
              </Pressable>
            </View>
            <Text style={styles.name}>{community?.name ?? '커뮤니티'}</Text>
            {community?.description ? <Text style={styles.desc}>{community.description}</Text> : null}
            <Text style={styles.meta}>멤버 {community?.memberCount?.toLocaleString() ?? '-'}</Text>

            {community ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={toggleJoin}
                  disabled={joinBusy}
                  style={[styles.joinBtn, community.isMember ? styles.joinBtnOn : styles.joinBtnOff, joinBusy && styles.dim]}
                >
                  <Text style={[styles.joinText, community.isMember && styles.joinTextOn]}>
                    {community.isMember ? '가입됨' : '가입하기'}
                  </Text>
                </Pressable>
                {community.isMember ? (
                  <Pressable onPress={() => router.push(`/compose?communityId=${id}`)} style={styles.writeBtn}>
                    <Text style={styles.writeText}>글쓰기</Text>
                  </Pressable>
                ) : null}
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  header: { marginHorizontal: -16, marginBottom: 12 },
  bannerWrap: { position: 'relative' },
  banner: { width: '100%', height: 160, backgroundColor: mono.color.surface2 },
  bannerFallback: { backgroundColor: mono.color.surface },
  back: {
    position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18,
    backgroundColor: mono.color.overlay, alignItems: 'center', justifyContent: 'center',
  },
  backText: { color: mono.color.onMedia, fontSize: 26, lineHeight: 28, marginTop: -2 },
  name: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800', marginTop: 14, paddingHorizontal: 16 },
  desc: { color: mono.color.textSecondary, fontSize: mono.font.body, marginTop: 6, paddingHorizontal: 16 },
  meta: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 8, paddingHorizontal: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, paddingHorizontal: 16 },
  joinBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: mono.radius.pill },
  joinBtnOff: { backgroundColor: mono.color.accent },
  joinBtnOn: { backgroundColor: mono.color.fillStrong },
  dim: { opacity: 0.5 },
  joinText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  joinTextOn: { color: mono.color.accentLight },
  // 스크롤 헤더 내 뒤로가기·가입
  hBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hJoin: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: mono.color.accent },
  hJoinOn: { backgroundColor: mono.color.fillStrong },
  hJoinText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  hJoinTextOn: { color: mono.color.accentLight },
  writeBtn: {
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: mono.radius.pill,
    backgroundColor: mono.color.fill, borderWidth: 1, borderColor: mono.color.border,
  },
  writeText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  feedLabel: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginTop: 20, paddingHorizontal: 16 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 32 },
})
