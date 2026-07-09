import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import type { Community, CommunityPost } from '@mono/shared'
import { api } from '@/lib/api'
import { CommunityCard } from '@/components/ui/community-card'
import { CommunityStory, PopularPostCard, CommunityRankRow } from '@/components/ui/hub-cards'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

interface Hub { popular: Community[]; recent: Community[]; mine: Community[]; popularPosts: CommunityPost[] }

// 커뮤니티 허브 — 웹 파리티: 내 커뮤니티(스토리줄) · 인기 글 · 인기 커뮤니티(순위) · 새 커뮤니티.
export default function ExploreScreen() {
  const insets = useSafeAreaInsets()
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
        <Pressable onPress={() => router.push('/notifications')} hitSlop={10} style={styles.iconBtn}>
          <Icon name="bell" size={18} color={mono.color.text} />
        </Pressable>
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

          {/* 새로 생긴 커뮤니티 */}
          {hub.recent.length > 0 && (
            <Section title="새로 생긴 커뮤니티">
              {hub.recent.map((c) => <CommunityCard key={c.id} community={c} onPress={() => go(c.id)} />)}
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
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.fill, alignItems: 'center', justifyContent: 'center' },
  h1: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800' },
  section: { marginTop: 24 },
  sectionTitle: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginBottom: 12 },
  storyRow: { gap: 14, paddingRight: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.small, textAlign: 'center', paddingVertical: 28 },
})
