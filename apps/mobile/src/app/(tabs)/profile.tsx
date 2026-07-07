import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import type { PublicSong, UserProfile } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { playSong } from '@/lib/player'
import { PublicSongRow } from '@/components/ui/public-song-row'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 프로필 탭 — 내 크리에이터 프로필(배너·아바타·소개·팔로워/곡·내 공개곡). 설정은 톱니.
export default function ProfileTab() {
  const insets = useSafeAreaInsets()
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
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={mono.color.accent} /></View>
  }

  const name = profile?.displayName || profile?.username || '내 프로필'
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
              {profile?.coverImage ? <Image source={{ uri: profile.coverImage }} style={styles.banner} contentFit="cover" /> : <View style={[styles.banner, styles.bannerFallback]} />}
              <Pressable onPress={() => router.push('/settings')} style={[styles.gear, { top: insets.top + 8 }]} hitSlop={10}>
                <Icon name="ellipsis" size={18} color={mono.color.onMedia} />
              </Pressable>
            </View>

            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {profile?.avatarImage ? <Image source={{ uri: profile.avatarImage }} style={styles.avatarImg} contentFit="cover" /> : <Text style={styles.avatarText}>{initial}</Text>}
              </View>
            </View>

            <Text style={styles.name}>{name}</Text>
            {profile?.username ? <Text style={styles.handle}>@{profile.username}</Text> : null}
            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.counts}>
              <Count label="곡" value={profile?.songCount ?? songs.length} />
              <Count label="팔로워" value={profile?.followerCount ?? 0} />
              <Count label="팔로잉" value={profile?.followingCount ?? 0} />
            </View>

            <Pressable style={styles.editBtn} onPress={() => router.push('/profile-edit')}>
              <Text style={styles.editText}>프로필 편집</Text>
            </Pressable>

            <Text style={styles.songsLabel}>공개 곡</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>공개한 곡이 아직 없어요</Text>}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text style={styles.countValue}>{value.toLocaleString()}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mono.color.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { marginHorizontal: -16, marginBottom: 8 },
  bannerWrap: { position: 'relative' },
  banner: { width: '100%', height: 130, backgroundColor: mono.color.surface2 },
  bannerFallback: { backgroundColor: mono.color.surface },
  gear: { position: 'absolute', right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: mono.color.overlay, alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { paddingHorizontal: 16, marginTop: -34 },
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
  countValue: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '800' },
  countLabel: { color: mono.color.textTertiary, fontSize: mono.font.tiny },
  editBtn: {
    marginHorizontal: 16, marginTop: 16, paddingVertical: 11, borderRadius: mono.radius.pill,
    backgroundColor: mono.color.fillStrong, alignItems: 'center',
  },
  editText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  songsLabel: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginTop: 24, paddingHorizontal: 16 },
  empty: { color: mono.color.textSecondary, fontSize: mono.font.body, textAlign: 'center', marginTop: 24 },
})
