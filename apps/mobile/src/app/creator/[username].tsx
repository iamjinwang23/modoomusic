import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import type { PublicSong, UserProfile } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
import { ProfileGrid, CoverScrim, formatCount } from '@/components/ui/profile-grid'
import { CollapsingHeader, HEADER_ROW } from '@/components/ui/collapsing-header'
import { Icon } from '@/components/ui/icon'
import { GlassIconButton } from '@/components/ui/glass-button'
import { mono } from '@/theme/mono'

// 크리에이터 프로필 — 웹 파리티: 커버(아바타·이름 오버레이) + 팔로우 + 스탯 + 세로 그리드.
export default function CreatorScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  const { username } = useLocalSearchParams<{ username: string }>()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [songs, setSongs] = useState<PublicSong[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followBusy, setFollowBusy] = useState(false)

  const load = useCallback(async () => {
    if (!username) return
    setError(null)
    try {
      const j = await api.get(`/api/explore/profile/${username}`) as { profile?: UserProfile; songs?: PublicSong[] }
      if (!j.profile) { setError('not_found'); setLoading(false); return }
      setProfile(j.profile)
      setSongs(j.songs ?? [])
      setFollowing(!!j.profile.isFollowing)
      setFollowerCount(j.profile.followerCount)
    } catch (e) {
      setError((e as { error?: string })?.error ?? 'network_error')
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => { load() }, [load])

  const toggleFollow = useCallback(async () => {
    if (!profile || followBusy) return
    const next = !following
    setFollowing(next); setFollowerCount((c) => c + (next ? 1 : -1)); setFollowBusy(true)
    try {
      const r = await api.post(`/api/profiles/${profile.userId}/follow`) as { following?: boolean; followerCount?: number }
      if (typeof r.following === 'boolean') setFollowing(r.following)
      if (typeof r.followerCount === 'number') setFollowerCount(r.followerCount)
    } catch {
      setFollowing(!next); setFollowerCount((c) => c + (next ? -1 : 1))
    } finally {
      setFollowBusy(false)
    }
  }, [profile, following, followBusy])

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={mono.color.accent} /></View>
  }
  if (error || !profile) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.err}>{error === 'not_found' ? '없는 프로필이에요' : '불러오지 못했어요'}</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.link}>닫기</Text></Pressable>
      </View>
    )
  }

  const name = profile.displayName || profile.username
  const initial = (name.trim().charAt(0) || '?').toUpperCase()

  const coverH = width * 9 / 16
  const fadeEnd = Math.max(coverH - (insets.top + HEADER_ROW), 60)
  const fadeStart = Math.max(fadeEnd - 70, 0)

  return (
    <View style={styles.container}>
      <CollapsingHeader
        scrollY={scrollY}
        fadeStart={fadeStart}
        fadeEnd={fadeEnd}
        title={name}
        left={
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.hBack}><Icon name="arrow.left" size={24} color={mono.color.text} /></Pressable>
        }
        right={
          <Pressable onPress={toggleFollow} disabled={followBusy} style={[styles.hFollow, following && styles.hFollowOn, followBusy && styles.dim]} hitSlop={8}>
            <Icon name={following ? 'following' : 'follow'} size={14} color={following ? mono.color.text : mono.color.onMedia} />
            <Text style={[styles.hFollowText, following && styles.hFollowTextOn]}>{following ? '팔로잉' : '팔로우'}</Text>
          </Pressable>
        }
      />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* ── 커버 + 아바타·이름 오버레이 ── */}
        <View style={styles.cover}>
          {profile.coverImage ? (
            <Image source={{ uri: profile.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.coverFallback]} />
          )}
          <CoverScrim />

          {/* 뒤로가기 (좌상단) — 글래스 딤 */}
          <GlassIconButton name="arrow.left" size={40} iconSize={22} onPress={() => router.back()} style={[styles.back, { top: insets.top + 12 }]} hitSlop={10} />

          {/* 팔로우 (우상단) */}
          <Pressable
            onPress={toggleFollow}
            disabled={followBusy}
            style={[styles.followPill, { top: insets.top + 12 }, following && styles.followingPill, followBusy && styles.dim]}
            hitSlop={8}
          >
            <Icon name={following ? 'following' : 'follow'} size={15} color={mono.color.onMedia} />
            <Text style={styles.followText}>{following ? '팔로잉' : '팔로우'}</Text>
          </Pressable>

          {/* 좌하단 아바타 + 이름 */}
          <View style={styles.identity}>
            <View style={styles.avatar}>
              {profile.avatarImage ? (
                <Image source={{ uri: profile.avatarImage }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.nameWrap}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.handle} numberOfLines={1}>@{profile.username}</Text>
            </View>
          </View>
        </View>

        {/* ── 스탯 + 소개 ── */}
        <View style={styles.meta}>
          <View style={styles.stats}>
            <Text style={styles.statItem}><Text style={styles.statNum}>{formatCount(profile.songCount)}</Text> 곡</Text>
            <Text style={styles.statItem}><Text style={styles.statNum}>{followerCount.toLocaleString()}</Text> 팔로워</Text>
            <Text style={styles.statItem}><Text style={styles.statNum}>{profile.followingCount.toLocaleString()}</Text> 팔로잉</Text>
          </View>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        {/* ── 음악/영상 탭 + 그리드 ── */}
        <View style={styles.gridWrap}>
          <ProfileGrid songs={songs} onPlay={(s) => playSong(s, songs)} empty="공개된 곡이 없어요" />
        </View>
      </Animated.ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  err: { color: mono.color.textSecondary, fontSize: mono.font.body },
  link: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700' },
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: mono.color.surface2, overflow: 'hidden' },
  coverFallback: { backgroundColor: mono.color.surface },
  back: { position: 'absolute', left: 20 },
  followPill: {
    position: 'absolute', right: 20, paddingHorizontal: 16, height: 40, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: mono.color.overlay,
  },
  followingPill: { backgroundColor: 'rgba(0,0,0,0.55)' },
  dim: { opacity: 0.5 },
  followText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '700' },
  // 스크롤 헤더 내 뒤로가기·팔로우
  hBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hFollow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 34, borderRadius: 17,
    backgroundColor: mono.color.accent,
  },
  hFollowOn: { backgroundColor: mono.color.fillStrong },
  hFollowText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '700' },
  hFollowTextOn: { color: mono.color.text },
  identity: { position: 'absolute', left: 16, bottom: 14, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, overflow: 'hidden',
    backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.onMedia, fontSize: 32, fontWeight: '800' },
  nameWrap: { flex: 1, minWidth: 0 },
  name: {
    color: mono.color.onMedia, fontSize: mono.font.h1, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  handle: {
    color: 'rgba(255,255,255,0.72)', fontSize: mono.font.small, marginTop: 3, fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  meta: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  stats: { flexDirection: 'row', gap: 20 },
  statItem: { color: mono.color.textTertiary, fontSize: mono.font.small },
  statNum: { color: mono.color.text, fontWeight: '700' },
  bio: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 20 },
  gridWrap: { marginTop: 18 },
})
