import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import type { PublicSong, UserProfile } from '@mono/shared'
import { api } from '@/lib/api'
import { playSong } from '@/lib/player'
import { PublicSongRow } from '@/components/ui/public-song-row'
import { mono } from '@/theme/mono'

// 크리에이터 프로필 — 배너/아바타/소개/카운트/팔로우 + 공개곡(GET /api/explore/profile/[username]).
export default function CreatorScreen() {
  const insets = useSafeAreaInsets()
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

  return (
    <View style={styles.container}>
      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <PublicSongRow song={item} onPress={() => playSong(item)} showCreator={false} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.bannerWrap}>
              {profile.coverImage ? <Image source={{ uri: profile.coverImage }} style={styles.banner} contentFit="cover" /> : <View style={[styles.banner, styles.bannerFallback]} />}
              <Pressable onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10}>
                <Text style={styles.backText}>‹</Text>
              </Pressable>
            </View>

            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {profile.avatarImage ? <Image source={{ uri: profile.avatarImage }} style={styles.avatarImg} contentFit="cover" /> : <Text style={styles.avatarText}>{initial}</Text>}
              </View>
            </View>

            <Text style={styles.name}>{name}</Text>
            <Text style={styles.handle}>@{profile.username}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.counts}>
              <Count label="곡" value={profile.songCount} />
              <Count label="팔로워" value={followerCount} />
              <Count label="팔로잉" value={profile.followingCount} />
            </View>

            <Pressable
              onPress={toggleFollow}
              disabled={followBusy}
              style={[styles.followBtn, following ? styles.followingBtn : styles.followBtnOn, followBusy && styles.dim]}
            >
              <Text style={[styles.followText, following && styles.followingText]}>{following ? '팔로잉' : '팔로우'}</Text>
            </Pressable>

            <Text style={styles.songsLabel}>공개 곡</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>공개된 곡이 없어요</Text>}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countValue}>{value.toLocaleString()}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  err: { color: mono.color.textSecondary, fontSize: mono.font.body },
  link: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700' },
  header: { marginHorizontal: -16, marginBottom: 8 },
  bannerWrap: { position: 'relative' },
  banner: { width: '100%', height: 140, backgroundColor: mono.color.surface2 },
  bannerFallback: { backgroundColor: mono.color.surface },
  back: { position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 26, lineHeight: 28, marginTop: -2 },
  avatarWrap: { paddingHorizontal: 16, marginTop: -36 },
  avatar: {
    width: 76, height: 76, borderRadius: 38, overflow: 'hidden', borderWidth: 3, borderColor: mono.color.bg,
    backgroundColor: mono.color.surface2, alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: mono.color.accentLight, fontSize: 30, fontWeight: '800' },
  name: { color: mono.color.text, fontSize: mono.font.h1, fontWeight: '800', marginTop: 10, paddingHorizontal: 16 },
  handle: { color: mono.color.accentLight, fontSize: mono.font.small, paddingHorizontal: 16, marginTop: 2 },
  bio: { color: mono.color.textSecondary, fontSize: mono.font.body, paddingHorizontal: 16, marginTop: 8, lineHeight: 20 },
  counts: { flexDirection: 'row', gap: 24, paddingHorizontal: 16, marginTop: 14 },
  count: { alignItems: 'flex-start' },
  countValue: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '800' },
  countLabel: { color: mono.color.textTertiary, fontSize: mono.font.tiny },
  followBtn: { marginHorizontal: 16, marginTop: 16, paddingVertical: 12, borderRadius: mono.radius.pill, alignItems: 'center' },
  followBtnOn: { backgroundColor: mono.color.accent },
  followingBtn: { backgroundColor: mono.color.fillStrong },
  dim: { opacity: 0.5 },
  followText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  followingText: { color: mono.color.accentLight },
  songsLabel: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginTop: 24, paddingHorizontal: 16 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 24 },
})
