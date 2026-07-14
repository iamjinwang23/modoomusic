import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { Community, CommunityPost } from '@mono/shared'
import { api } from '@/lib/api'
import { useAuthGate } from '@/lib/auth-gate'
import { hapticLight } from '@/lib/haptics'
import { CommunityStory, PopularPostCard, CommunityRankRow, CommunityCoverCard } from '@/components/ui/hub-cards'
import { Icon } from '@/components/ui/icon'
import { NotificationBell } from '@/components/ui/notification-bell'
import { mono } from '@/theme/mono'

interface Hub { popular: Community[]; recent: Community[]; mine: Community[]; popularPosts: CommunityPost[] }

// 커뮤니티 허브 — 웹 파리티: 내 커뮤니티(스토리줄) · 인기 글 · 인기 커뮤니티(순위) · 새 커뮤니티.
export default function ExploreScreen() {
  const insets = useSafeAreaInsets()
  const { requireAuth } = useAuthGate()
  const { width } = useWindowDimensions()
  const [hub, setHub] = useState<Hub | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const j = await api.get('/api/communities') as Hub
      setHub({ popular: j.popular ?? [], recent: j.recent ?? [], mine: j.mine ?? [], popularPosts: j.popularPosts ?? [] })
    } catch (e) {
      setError((e as { error?: string })?.error ?? 'network_error')
      setHub({ popular: [], recent: [], mine: [], popularPosts: [] })
    }
  }, [])

  useEffect(() => { load() }, [load])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = useCallback(async () => {
    hapticLight()
    setRefreshing(true); await load(); setRefreshing(false)
  }, [load])

  const go = (id: string) => router.push(`/community/${id}`)
  const goPost = (p: CommunityPost) => router.push(`/community/${p.communityId}?post=${p.id}`)
  // 2열 그리드 카드 폭 (좌우 패딩 20*2, 카드 간격 12)
  const cardW = (width - 40 - 12) / 2

  const mine = hub ? [...hub.mine].sort((a, b) => (b.recentPostCount ?? 0) - (a.recentPostCount ?? 0)) : []

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>커뮤니티</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => { if (requireAuth()) router.push('/community-create') }} hitSlop={10} style={styles.iconBtn}>
            <Icon name="plus" size={22} color={mono.color.text} />
          </Pressable>
          <Pressable onPress={() => { if (requireAuth()) router.push('/notifications') }} hitSlop={10} style={styles.iconBtn}>
            <NotificationBell size={18} color={mono.color.text} />
          </Pressable>
        </View>
      </View>

      {hub === null ? (
        <ActivityIndicator color={mono.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mono.color.textSecondary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* 내 커뮤니티 — 스토리 가로 스크롤 */}
          {mine.length > 0 && (
            <Section title="내 커뮤니티">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.storyScroll}
                contentContainerStyle={styles.storyRow}
              >
                {mine.map((c) => <CommunityStory key={c.id} c={c} onPress={() => go(c.id)} />)}
              </ScrollView>
            </Section>
          )}

          {/* 인기 글 — 첫 글 풀폭 강조 + 나머지 2열 그리드(웹 파리티) */}
          {hub.popularPosts.length > 0 && (
            <Section title="인기 글">
              <View style={{ gap: 12 }}>
                <PopularPostCard post={hub.popularPosts[0]} width={width - 40} onPress={() => goPost(hub.popularPosts[0])} />
                {hub.popularPosts.length > 1 && (
                  <View style={styles.grid}>
                    {hub.popularPosts.slice(1).map((p) => (
                      <PopularPostCard key={p.id} post={p} width={cardW} onPress={() => goPost(p)} />
                    ))}
                  </View>
                )}
              </View>
            </Section>
          )}

          {/* 인기 커뮤니티 — 순위 행 */}
          <Section title="인기 커뮤니티">
            {hub.popular.length === 0 ? (
              <Text style={styles.empty}>{error ? `불러오지 못했어요 (${error})` : '아직 커뮤니티가 없어요'}</Text>
            ) : (
              hub.popular.map((c, i) => <CommunityRankRow key={c.id} c={c} rank={i + 1} onPress={() => go(c.id)} />)
            )}
          </Section>

          {/* 새로 생긴 커뮤니티 — 2열 커버 카드 */}
          {hub.recent.length > 0 && (
            <Section title="새로 생긴 커뮤니티">
              <View style={styles.grid}>
                {hub.recent.map((c) => <CommunityCoverCard key={c.id} c={c} width={cardW} onPress={() => go(c.id)} />)}
              </View>
            </Section>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.fill, alignItems: 'center', justifyContent: 'center' },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800' },
  section: { marginTop: 24 },
  sectionTitle: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginBottom: 12 },
  // 캐러셀 풀블리드 — 컨테이너 좌우 패딩(20) 밖으로 나가고, 콘텐츠는 패딩만큼 인셋
  storyScroll: { marginHorizontal: -20 },
  storyRow: { gap: 14, paddingHorizontal: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.small, textAlign: 'center', paddingVertical: 28 },
})
