import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy'
import type { Community } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''

function daysLeft(iso: string | null): number {
  if (!iso) return 14
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

// 커뮤니티 수정(매니저) — 이름·주제·소개·공개범위. PATCH /api/communities/[id].
// 커버/아바타 이미지 편집은 후속.
export default function CommunityEditScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [joinRules, setJoinRules] = useState('')
  const [wasPrivate, setWasPrivate] = useState(false)
  const [status, setStatus] = useState<'open' | 'closing'>('open')
  const [closeScheduledAt, setCloseScheduledAt] = useState<string | null>(null)
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [avatarImage, setAvatarImage] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'cover' | 'avatar' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const j = await api.get(`/api/communities/${id}`) as { community?: Community }
      const c = j.community
      if (c) {
        setName(c.name)
        setTopic(c.topic ?? '')
        setDescription(c.description ?? '')
        setVisibility(c.visibility)
        setJoinRules(c.joinRules ?? '')
        setWasPrivate(c.visibility === 'private')
        setStatus(c.status ?? 'open')
        setCloseScheduledAt(c.closeScheduledAt ?? null)
        setCoverImage(c.coverImage ?? null)
        setAvatarImage(c.avatarImage ?? null)
      }
    } catch { /* 무시 */ } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const canSave = name.trim().length >= 2 && !saving

  const save = useCallback(async () => {
    if (!id || !canSave) return
    setSaving(true); setError(null)
    try {
      await api.patch(`/api/communities/${id}`, {
        name: name.trim(),
        topic: topic.trim() || null,
        description: description.trim() || null,
        visibility,
        joinRules: visibility === 'private' ? joinRules.trim() : '',
      })
      router.back()
    } catch (e) {
      const err = e as { error?: string }
      setError(err.error === 'invalid_name' ? '이름은 2~30자로 입력해주세요'
        : err.error === 'banned_word' ? '부적절한 표현이 포함되어 있어요'
        : '저장에 실패했어요')
      setSaving(false)
    }
  }, [id, canSave, name, topic, description, visibility, joinRules])

  // 커버/대표 이미지 — multipart로 /image 엔드포인트에 업로드(서버가 webp 변환·즉시 반영).
  const pickImage = useCallback(async (type: 'cover' | 'avatar') => {
    if (!id || uploading) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { setError('사진 접근 권한이 필요해요'); return }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true,
      aspect: type === 'cover' ? [5, 2] : [1, 1], quality: 0.85,
    })
    if (res.canceled || !res.assets?.[0]) return
    const a = res.assets[0]
    setUploading(type); setError(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const up = await uploadAsync(`${API_BASE}/api/communities/${id}/image`, a.uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: a.mimeType ?? 'image/jpeg',
        parameters: { type },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const j = JSON.parse(up.body || '{}') as { url?: string; error?: string }
      if (up.status >= 200 && up.status < 300 && j.url) {
        if (type === 'cover') setCoverImage(j.url); else setAvatarImage(j.url)
      } else {
        setError(`이미지 업로드 실패 (${j.error ?? up.status})`)
      }
    } catch {
      setError('이미지 업로드 실패 (네트워크)')
    } finally {
      setUploading(null)
    }
  }, [id, uploading])

  // 폐쇄 — DELETE. 남의 글 없으면 즉시 삭제, 있으면 14일 유예(closing).
  const closeCommunity = useCallback(() => {
    if (!id) return
    Alert.alert(
      '이 커뮤니티를 폐쇄하시겠어요?',
      '다른 회원이 남긴 글·댓글이 있으면 14일 예고 후 폐쇄돼요(그 전엔 읽기전용). 남의 글이 없으면 즉시 삭제돼요. 회원이 첨부한 곡은 사라지지 않아요.',
      [
        { text: '아니요', style: 'cancel' },
        {
          text: '폐쇄하기', style: 'destructive', onPress: async () => {
            try {
              const j = await api.del(`/api/communities/${id}`) as { deleted?: boolean; closeScheduledAt?: string | null }
              if (j.deleted) {
                Alert.alert('커뮤니티를 폐쇄했어요')
                router.back()                              // 수정 모달 닫기
                setTimeout(() => router.back(), 350)        // 삭제된 커뮤니티 화면에서 나가 허브로
              } else {
                setStatus('closing'); setCloseScheduledAt(j.closeScheduledAt ?? null)
                Alert.alert('폐쇄를 예약했어요', '14일 후 삭제돼요. 그 전엔 읽기전용이며 철회할 수 있어요.')
              }
            } catch (e) {
              const code = (e as { error?: string })?.error
              Alert.alert(code === 'already_closing' ? '이미 폐쇄 예정이에요' : '폐쇄에 실패했어요')
            }
          },
        },
      ],
    )
  }, [id])

  const cancelClosing = useCallback(async () => {
    if (!id) return
    try {
      await api.post(`/api/communities/${id}/cancel-closing`)
      setStatus('open'); setCloseScheduledAt(null)
      Alert.alert('폐쇄를 철회했어요')
    } catch { Alert.alert('철회에 실패했어요') }
  }, [id])

  if (loading) {
    return <View style={[styles.container, styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={mono.color.accent} /></View>
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          <Text style={styles.title}>커뮤니티 수정</Text>
          <Pressable onPress={canSave ? save : undefined} hitSlop={8}>
            <Text style={[styles.save, !canSave && styles.saveOff]}>{saving ? '저장 중…' : '저장'}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* 커버 + 대표 이미지 */}
          <Pressable style={styles.cover} onPress={() => pickImage('cover')}>
            {coverImage ? <Image source={{ uri: coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, styles.coverEmpty]} />}
            <View style={styles.coverBadge}><Icon name="photo.album" size={15} color={mono.color.onMedia} /><Text style={styles.coverBadgeText}>커버 변경</Text></View>
            {uploading === 'cover' ? <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View> : null}
          </Pressable>

          <View style={styles.avatarRow}>
            <Pressable style={styles.avatarWrap} onPress={() => pickImage('avatar')}>
              <View style={styles.avatar}>
                {avatarImage ? <Image source={{ uri: avatarImage }} style={styles.avatarImg} contentFit="cover" /> : <View style={[styles.avatarImg, styles.avatarEmpty]}><Icon name="photo.album" size={22} color={mono.color.textTertiary} /></View>}
                {uploading === 'avatar' ? <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View> : null}
              </View>
              <View style={styles.avatarBadge}><Icon name="photo.album" size={13} color="#111318" /></View>
            </Pressable>
            <Text style={styles.avatarHint}>대표 이미지 · 눌러서 변경</Text>
          </View>

          <Text style={styles.label}>이름</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="커뮤니티 이름(2~30자)" placeholderTextColor={mono.color.textTertiary} maxLength={30} />

          <Text style={styles.label}>주제</Text>
          <TextInput style={styles.input} value={topic} onChangeText={setTopic} placeholder="예: 로파이, K-pop" placeholderTextColor={mono.color.textTertiary} />

          <Text style={styles.label}>소개</Text>
          <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="커뮤니티 소개" placeholderTextColor={mono.color.textTertiary} multiline />

          <Text style={styles.label}>공개 범위</Text>
          <View style={styles.segment}>
            {(['public', 'private'] as const).map((v) => {
              const on = visibility === v
              return (
                <Pressable key={v} onPress={() => setVisibility(v)} style={[styles.segBtn, on && styles.segBtnOn]}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{v === 'public' ? '공개' : '비공개'}</Text>
                </Pressable>
              )
            })}
          </View>
          {wasPrivate && visibility === 'public' ? (
            <Text style={styles.warn}>공개로 바꾸면 대기 중인 가입 신청이 모두 자동 수락돼요.</Text>
          ) : null}

          {visibility === 'private' ? (
            <>
              <Text style={styles.label}>가입 규칙 (선택)</Text>
              <TextInput style={[styles.input, styles.multiline]} value={joinRules} onChangeText={setJoinRules} placeholder="가입 신청 시 안내할 규칙" placeholderTextColor={mono.color.textTertiary} multiline />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* 폐쇄 (danger) — closing 유예 중이면 D-day + 철회, 아니면 폐쇄 트리거 */}
          <View style={styles.danger}>
            {status === 'closing' ? (
              <>
                <Text style={styles.dangerLabel}>폐쇄 예정 · D-{daysLeft(closeScheduledAt)}</Text>
                <Pressable style={styles.cancelBtn} onPress={cancelClosing}><Text style={styles.cancelText}>폐쇄 철회하기</Text></Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.closeBtn} onPress={closeCommunity}><Text style={styles.closeText}>커뮤니티 폐쇄</Text></Pressable>
                <Text style={styles.dangerHint}>다른 회원의 글이 있으면 14일 예고 후 폐쇄돼요. 없으면 즉시 삭제돼요.</Text>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  close: { color: mono.color.text, fontSize: 22, width: 40 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  save: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '700', width: 40, textAlign: 'right' },
  saveOff: { color: mono.color.textTertiary },
  // 커버 + 대표 이미지
  cover: { width: '100%', aspectRatio: 5 / 2, borderRadius: mono.radius.lg, overflow: 'hidden', backgroundColor: mono.color.surface2, marginTop: 4 },
  coverEmpty: { backgroundColor: mono.color.surface },
  coverBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: mono.radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  coverBadgeText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '600' },
  uploadOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -26, marginLeft: 6 },
  avatarWrap: { width: 80, height: 80 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: mono.color.bg, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  avatarImg: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarEmpty: { backgroundColor: mono.color.surface },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: mono.color.bg },
  avatarHint: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 24 },
  label: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', marginTop: 18, marginBottom: 8 },
  input: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  segment: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 12, borderRadius: mono.radius.md, backgroundColor: mono.color.fill, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#ffffff' },
  segText: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '600' },
  segTextOn: { color: mono.color.bg, fontWeight: '700' },
  warn: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 8, lineHeight: 18 },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 16, textAlign: 'center' },
  // 폐쇄 danger zone
  danger: { marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: mono.color.borderSoft },
  closeBtn: { paddingVertical: 14, borderRadius: mono.radius.md, alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.12)' },
  closeText: { color: mono.color.danger, fontSize: mono.font.body, fontWeight: '700' },
  dangerHint: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 8, lineHeight: 18 },
  dangerLabel: { color: mono.color.danger, fontSize: mono.font.small, fontWeight: '700', marginBottom: 10 },
  cancelBtn: { paddingVertical: 14, borderRadius: mono.radius.md, alignItems: 'center', backgroundColor: mono.color.fillStrong },
  cancelText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
})
