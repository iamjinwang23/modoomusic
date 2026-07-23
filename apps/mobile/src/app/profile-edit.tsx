import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { uploadProfileImage } from '@/lib/profile-image'
import { toast } from '@/lib/toast'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

const NAME_MAX = 20
const BIO_MAX = 150
const USERNAME_RE = /^[a-z0-9._]{4,30}$/

const SOCIAL_FIELDS = [
  { key: 'instagram', label: '인스타그램', placeholder: 'instagram.com/username' },
  { key: 'tiktok', label: '틱톡', placeholder: 'tiktok.com/@username' },
  { key: 'youtube', label: '유튜브', placeholder: 'youtube.com/@channel' },
  { key: 'facebook', label: '페이스북', placeholder: 'facebook.com/username' },
  { key: 'x', label: 'X', placeholder: 'x.com/username' },
] as const
type SocialKey = (typeof SOCIAL_FIELDS)[number]['key']

function usernameError(v: string): string | null {
  if (!v) return '아이디를 입력해주세요'
  if (v.length < 4) return '아이디는 최소 4자 이상이어야 해요'
  if (!USERNAME_RE.test(v)) return '영문 소문자·숫자·. _ 만 쓸 수 있어요'
  if (/\.\./.test(v) || v.startsWith('.') || v.endsWith('.')) return '점(.)은 연속·양끝에 쓸 수 없어요'
  return null
}
function normalizeUrl(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

// 프로필 편집 — 웹 ProfileEditModal 파리티: 커버·아바타 이미지·닉네임·아이디(1회 변경·중복체크)·소개·SNS 링크.
export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [initialUsername, setInitialUsername] = useState('')
  const [usernameChangedAt, setUsernameChangedAt] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [links, setLinks] = useState<Record<SocialKey, string>>({ instagram: '', tiktok: '', youtube: '', facebook: '', x: '' })
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [avatarHue, setAvatarHue] = useState(250)
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null)

  const [usernameMsg, setUsernameMsg] = useState('')
  const [usernameOk, setUsernameOk] = useState(true)
  const usernameLocked = usernameChangedAt !== null

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase.from('profiles')
        .select('display_name, username, bio, avatar_url, cover_url, avatar_hue, username_changed_at, link_instagram, link_tiktok, link_youtube, link_facebook, link_x')
        .eq('id', user.id).maybeSingle()
      const p = (data ?? {}) as Record<string, string | null>
      setName(p.display_name ?? '')
      setUsername(p.username ?? '')
      setInitialUsername(p.username ?? '')
      setUsernameChangedAt(p.username_changed_at ?? null)
      setBio(p.bio ?? '')
      setAvatarUrl(p.avatar_url ?? null)
      setCoverUrl(p.cover_url ?? null)
      setAvatarHue(Number(p.avatar_hue ?? 250))
      setLinks({
        instagram: p.link_instagram ?? '', tiktok: p.link_tiktok ?? '', youtube: p.link_youtube ?? '',
        facebook: p.link_facebook ?? '', x: p.link_x ?? '',
      })
      setLoading(false)
    })()
  }, [])

  // 아이디 유효성 + 중복 체크(디바운스)
  useEffect(() => {
    if (usernameLocked) return
    const v = username.toLowerCase()
    if (v === initialUsername) { setUsernameMsg(''); setUsernameOk(true); return }
    const err = usernameError(v)
    if (err) { setUsernameMsg(err); setUsernameOk(false); return }
    let cancelled = false
    setUsernameMsg('확인 중…'); setUsernameOk(false)
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/api/check-username?username=${encodeURIComponent(v)}`) as { available?: boolean }
        if (cancelled) return
        if (r.available) { setUsernameMsg('사용할 수 있는 아이디예요'); setUsernameOk(true) }
        else { setUsernameMsg('이미 사용 중인 아이디예요'); setUsernameOk(false) }
      } catch { if (!cancelled) { setUsernameMsg('확인에 실패했어요'); setUsernameOk(false) } }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
  }, [username, initialUsername, usernameLocked])

  const pickImage = async (type: 'avatar' | 'cover') => {
    if (uploading) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { setError('사진 접근 권한이 필요해요'); return }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true,
      aspect: type === 'avatar' ? [1, 1] : [1064, 368], quality: 0.7,
    })
    if (res.canceled || !res.assets?.[0] || !userId) return
    const a = res.assets[0]
    // GIF 차단(웹 파리티·용량) — 웹은 첫 프레임 정적 WebP로 변환, 앱은 정적 변환이 네이티브(Build15)라 지금은 차단.
    if ((a.mimeType ?? '').toLowerCase().includes('gif') || a.uri.toLowerCase().includes('.gif')) {
      setError('GIF는 프로필 이미지로 사용할 수 없어요'); toast.error('GIF는 프로필 이미지로 사용할 수 없어요'); return
    }
    setUploading(type); setError(null)
    const url = await uploadProfileImage(a.uri, type, a.mimeType ?? 'image/jpeg')
    if (url) {
      await supabase.from('profiles').update({ [type === 'avatar' ? 'avatar_url' : 'cover_url']: url }).eq('id', userId)
      if (type === 'avatar') setAvatarUrl(url); else setCoverUrl(url)
      toast.success(type === 'avatar' ? '프로필 사진이 변경되었어요' : '커버 이미지가 변경되었어요')
    } else {
      setError('이미지 업로드에 실패했어요')
      toast.error('이미지 업로드에 실패했어요')
    }
    setUploading(null)
  }

  const canSave = !!name.trim() && usernameOk && !busy && !loading

  const save = async () => {
    if (!canSave || !userId) return
    setBusy(true); setError(null)
    const finalUsername = usernameLocked ? initialUsername : username.toLowerCase()
    const finalName = name.trim()
    const usernameDidChange = !usernameLocked && finalUsername !== initialUsername

    const update: Record<string, unknown> = {
      display_name: finalName,
      bio: bio.trim() || null,
      link_instagram: normalizeUrl(links.instagram),
      link_tiktok: normalizeUrl(links.tiktok),
      link_youtube: normalizeUrl(links.youtube),
      link_facebook: normalizeUrl(links.facebook),
      link_x: normalizeUrl(links.x),
    }
    if (usernameDidChange) { update.username = finalUsername; update.username_changed_at = new Date().toISOString() }

    const { error: dbError } = await supabase.from('profiles').update(update).eq('id', userId)
    if (dbError) { setError('저장에 실패했어요. 잠시 후 다시 시도해 주세요.'); setBusy(false); return }
    await supabase.auth.updateUser({ data: { username: finalUsername, full_name: finalName } }).catch(() => {})
    router.back()
    toast.success('프로필이 업데이트되었어요')
  }

  const initial = (name.trim().charAt(0) || username.charAt(0) || '?').toUpperCase()

  if (loading) {
    return <View style={[styles.container, styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={mono.color.accent} /></View>
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          <Text style={styles.title}>프로필 편집</Text>
          <Pressable onPress={save} disabled={!canSave} hitSlop={12}>
            <Text style={[styles.saveBtn, !canSave && styles.saveOff]}>{busy ? '저장 중' : '저장'}</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {/* 커버 + 아바타 */}
          <Pressable style={styles.cover} onPress={() => pickImage('cover')}>
            {coverUrl ? <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.coverEmpty]} />}
            <View style={styles.coverBadge}><Icon name="photo.album" size={15} color={mono.color.onMedia} /><Text style={styles.coverBadgeText}>커버 변경</Text></View>
            {uploading === 'cover' ? <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View> : null}
          </Pressable>

          <View style={styles.avatarRow}>
            <Pressable style={styles.avatarWrap} onPress={() => pickImage('avatar')}>
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <View style={[styles.avatarImg, { backgroundColor: `hsl(${avatarHue}, 40%, 38%)` }]}><Text style={styles.avatarText}>{initial}</Text></View>
                )}
                {uploading === 'avatar' ? <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View> : null}
              </View>
              <View style={styles.avatarBadge}><Icon name="photo.album" size={13} color="#111318" /></View>
            </Pressable>
            <Text style={styles.avatarHint}>사진을 눌러 변경</Text>
          </View>

          {/* 닉네임 */}
          <Text style={styles.label}>닉네임</Text>
          <TextInput style={styles.input} placeholder="닉네임" placeholderTextColor={mono.color.textTertiary}
            value={name} onChangeText={(t) => t.length <= NAME_MAX && setName(t)} />

          {/* 아이디 */}
          <Text style={styles.label}>아이디</Text>
          {usernameLocked ? (
            <>
              <View style={[styles.input, styles.lockedRow]}>
                <Text style={styles.lockedText}>@{initialUsername}</Text>
                <Text style={styles.lockedTag}>변경 불가</Text>
              </View>
              <Text style={styles.hint}>아이디는 최초 1회만 변경할 수 있어요.</Text>
            </>
          ) : (
            <>
              <View style={styles.usernameWrap}>
                <Text style={styles.at}>@</Text>
                <TextInput style={styles.usernameInput} placeholder="아이디" placeholderTextColor={mono.color.textTertiary}
                  autoCapitalize="none" autoCorrect={false} value={username}
                  onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30))} />
              </View>
              {usernameMsg ? <Text style={[styles.hint, usernameOk ? styles.ok : styles.bad]}>{usernameMsg}</Text> : <Text style={styles.hint}>영문 소문자·숫자·. _ · 4~30자. 변경은 1회만 가능해요.</Text>}
            </>
          )}

          {/* 소개 */}
          <Text style={styles.label}>소개</Text>
          <TextInput style={[styles.input, styles.bio]} placeholder="자기소개를 적어보세요" placeholderTextColor={mono.color.textTertiary}
            value={bio} onChangeText={(t) => t.length <= BIO_MAX && setBio(t)} multiline />
          <Text style={styles.count}>{bio.length}/{BIO_MAX}</Text>

          {/* SNS */}
          <Text style={[styles.label, { marginTop: 22 }]}>SNS 링크</Text>
          {SOCIAL_FIELDS.map((f) => (
            <View key={f.key} style={styles.snsRow}>
              <Text style={styles.snsLabel}>{f.label}</Text>
              <TextInput style={styles.snsInput} placeholder={f.placeholder} placeholderTextColor={mono.color.textTertiary}
                autoCapitalize="none" autoCorrect={false} keyboardType="url"
                value={links[f.key]} onChangeText={(t) => setLinks((p) => ({ ...p, [f.key]: t }))} />
            </View>
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  close: { color: mono.color.text, fontSize: 22 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  saveBtn: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '800' },
  saveOff: { color: mono.color.textTertiary },
  // 커버
  cover: { width: '100%', aspectRatio: 1064 / 368, borderRadius: mono.radius.lg, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  coverEmpty: { backgroundColor: mono.color.surface },
  coverBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: mono.radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  coverBadgeText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '600' },
  uploadOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  // 아바타
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -28, marginLeft: 6 },
  avatarWrap: { width: 84, height: 84 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: mono.color.bg, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  avatarImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: mono.color.onMedia, fontSize: 32, fontWeight: '800' },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: mono.color.bg },
  avatarHint: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 26 },
  // 필드
  label: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  bio: { minHeight: 92, textAlignVertical: 'top' },
  count: { color: mono.color.textTertiary, fontSize: mono.font.small, textAlign: 'right', marginTop: 6 },
  hint: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 6 },
  ok: { color: '#34d399' },
  bad: { color: mono.color.danger },
  lockedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lockedText: { color: mono.color.textSecondary, fontSize: mono.font.body },
  lockedTag: { color: mono.color.textTertiary, fontSize: mono.font.tiny, fontWeight: '600' },
  usernameWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: mono.color.surface, borderRadius: mono.radius.md,
    borderWidth: 1, borderColor: mono.color.borderSoft, paddingHorizontal: 14,
  },
  at: { color: mono.color.textTertiary, fontSize: mono.font.body },
  usernameInput: { flex: 1, color: mono.color.text, fontSize: mono.font.body, paddingVertical: 12, paddingLeft: 2 },
  // SNS
  snsRow: { marginBottom: 10 },
  snsLabel: { color: mono.color.textSecondary, fontSize: mono.font.small, marginBottom: 6 },
  snsInput: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 16, textAlign: 'center' },
})
