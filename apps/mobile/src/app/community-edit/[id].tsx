import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import type { Community } from '@mono/shared'
import { api } from '@/lib/api'
import { mono } from '@/theme/mono'

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
})
