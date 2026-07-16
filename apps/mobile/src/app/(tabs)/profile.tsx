import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import type { PublicSong, UserProfile } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { playSong } from '@/lib/player'
import { ProfileGrid, CoverScrim, formatCount } from '@/components/ui/profile-grid'
import { CollapsingHeader, HEADER_ROW } from '@/components/ui/collapsing-header'
import { Icon } from '@/components/ui/icon'
import { GlassIconButton, GlassPill } from '@/components/ui/glass-button'
import { NotificationBell } from '@/components/ui/notification-bell'
import { SkeletonBox, SkeletonProfileGrid } from '@/components/ui/skeleton'
import { mono } from '@/theme/mono'

// 프로필 탭 — 웹 파리티: 커버(아바타·이름 오버레이) + 인라인 스탯 + 음악/영상 탭 + 세로 그리드.
export default function ProfileTab() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scrollY = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [songs, setSongs] = useState<PublicSong[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: prof } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
    const username = (prof as { username?: string } | null)?.username
    if (!username) { setLoading(false); return }
    try {
      const j = await api.get(`/api/explore/profile/${username}`) as { profile?: UserProfile; songs?: PublicSong[] }
      setProfile(j.profile ?? null)
      setSongs(j.songs ?? [])
    } catch {
      // 무시
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useFocusEffect(useCallback(() => { load() }, [load]))

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonBox w="100%" h={width * 9 / 16} radius={0} />
        <SkeletonProfileGrid style={{ marginTop: 44 }} />
      </View>
    )
  }

  const name = profile?.displayName || profile?.username || '내 프로필'
  const initial = (name.trim().charAt(0) || '?').toUpperCase()
  const songCount = profile?.songCount ?? songs.length

  // 커버(16:9)가 헤더 아래로 사라질 즈음 페이드인
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
        right={
          <>
            <Pressable onPress={() => router.push('/notifications')} hitSlop={8} style={styles.hCircle}><NotificationBell size={20} color={mono.color.text} /></Pressable>
            <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.hCircle}><Icon name="ellipsis" size={20} color={mono.color.text} /></Pressable>
          </>
        }
      />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* ── 커버 + 아바타·이름 오버레이 ── */}
        <View style={styles.cover}>
          {profile?.coverImage ? (
            <Image source={{ uri: profile.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.coverFallback]} />
          )}
          {/* 하단 스크림 — 오버레이 텍스트 가독성(그라데이션) */}
          <CoverScrim />

          {/* 우상단 액션 — 프로필 수정 · 알림 · 설정 */}
          <View style={[styles.topActions, { top: insets.top + 12 }]}>
            <GlassPill onPress={() => router.push('/profile-edit')}>
              <Text style={styles.editText}>프로필 편집</Text>
            </GlassPill>
            <GlassIconButton size={40} onPress={() => router.push('/notifications')} hitSlop={8}>
              <NotificationBell size={18} color={mono.color.onMedia} />
            </GlassIconButton>
            <GlassIconButton name="ellipsis" size={40} iconSize={18} color={mono.color.onMedia} onPress={() => router.push('/settings')} hitSlop={8} />
          </View>

          {/* 좌하단 아바타 + 이름 */}
          <View style={styles.identity}>
            <View style={styles.avatar}>
              {profile?.avatarImage ? (
                <Image source={{ uri: profile.avatarImage }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.nameWrap}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {profile?.username ? <Text style={styles.handle} numberOfLines={1}>@{profile.username}</Text> : null}
            </View>
          </View>
        </View>

        {/* ── 스탯 + 소개 ── */}
        <View style={styles.meta}>
          <View style={styles.stats}>
            <Text style={styles.statItem}><Text style={styles.statNum}>{formatCount(songCount)}</Text> 곡</Text>
            <Text style={styles.statItem}><Text style={styles.statNum}>{(profile?.followerCount ?? 0).toLocaleString()}</Text> 팔로워</Text>
            <Text style={styles.statItem}><Text style={styles.statNum}>{(profile?.followingCount ?? 0).toLocaleString()}</Text> 팔로잉</Text>
          </View>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        {/* ── 음악/영상 탭 + 그리드 ── */}
        <View style={styles.gridWrap}>
          <ProfileGrid songs={songs} onPlay={(s) => playSong(s, songs)} empty="공개한 곡이 아직 없어요" />
        </View>
      </Animated.ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  // 커버 = 16:9(웹 aspect-video)
  cover: { width: '100%', aspectRatio: 16 / 9, backgroundColor: mono.color.surface2, overflow: 'hidden' },
  coverFallback: { backgroundColor: mono.color.surface },
  topActions: { position: 'absolute', right: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  editPill: {
    paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: mono.color.overlay,
    alignItems: 'center', justifyContent: 'center',
  },
  editText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '600' },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: mono.color.overlay, alignItems: 'center', justifyContent: 'center' },
  hCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
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
