import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { api } from '@/lib/api'
import { mono } from '@/theme/mono'

// 커뮤니티 만들기 — 웹 CreateCommunityModal 파리티. 이름·주제·소개·공개설정·가입수칙(비공개). 1인 최대 3개.
export default function CommunityCreateScreen() {
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [joinRules, setJoinRules] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = name.trim().length >= 2 && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    try {
      const j = await api.post('/api/communities', {
        name: name.trim(),
        topic: topic.trim(),
        description: description.trim(),
        visibility,
        joinRules: visibility === 'private' ? joinRules.trim() : '',
      }) as { community?: { id: string } }
      if (j.community?.id) {
        router.back()
        router.push(`/community/${j.community.id}`)
      } else {
        router.back()
      }
    } catch (e) {
      const code = (e as { error?: string })?.error
      setError(
        code === 'community_limit_reached' ? '커뮤니티는 최대 3개까지 만들 수 있어요'
        : code === 'banned_word' ? '부적절한 표현이 포함되어 있어요'
        : '개설에 실패했어요',
      )
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          <Text style={styles.title}>커뮤니티 만들기</Text>
          <Pressable onPress={submit} disabled={!canSubmit} hitSlop={12}>
            <Text style={[styles.saveBtn, !canSubmit && styles.saveOff]}>{busy ? '만드는 중' : '만들기'}</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>한 명당 최대 3개까지 운영할 수 있어요. 당신이 매니저가 됩니다.</Text>

          <Text style={styles.label}>이름 <Text style={styles.req}>*</Text></Text>
          <TextInput style={styles.input} placeholder="예: 로파이 작업실" placeholderTextColor={mono.color.textTertiary}
            value={name} onChangeText={(t) => t.length <= 30 && setName(t)} />

          <Text style={styles.label}>주제</Text>
          <TextInput style={styles.input} placeholder="예: 잔잔한 비트, 공부할 때 듣는 음악" placeholderTextColor={mono.color.textTertiary}
            value={topic} onChangeText={(t) => t.length <= 40 && setTopic(t)} />

          <Text style={styles.label}>소개</Text>
          <TextInput style={[styles.input, styles.area]} placeholder="어떤 커뮤니티인가요?" placeholderTextColor={mono.color.textTertiary}
            value={description} onChangeText={(t) => t.length <= 500 && setDescription(t)} multiline />

          <Text style={styles.label}>공개 설정</Text>
          <View style={styles.seg}>
            <Pressable style={[styles.segBtn, visibility === 'public' && styles.segOn]} onPress={() => setVisibility('public')}>
              <Text style={[styles.segText, visibility === 'public' && styles.segTextOn]}>공개</Text>
            </Pressable>
            <Pressable style={[styles.segBtn, visibility === 'private' && styles.segOn]} onPress={() => setVisibility('private')}>
              <Text style={[styles.segText, visibility === 'private' && styles.segTextOn]}>비공개</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>{visibility === 'private' ? '멤버만 글을 볼 수 있고, 가입은 매니저 승인이 필요해요.' : '누구나 글을 보고 바로 가입할 수 있어요.'}</Text>

          {visibility === 'private' ? (
            <>
              <Text style={styles.label}>가입 수칙 (선택)</Text>
              <TextInput style={[styles.input, styles.area]} placeholder="가입 신청 시 보여줄 안내나 규칙을 적어주세요" placeholderTextColor={mono.color.textTertiary}
                value={joinRules} onChangeText={(t) => t.length <= 1000 && setJoinRules(t)} multiline />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  close: { color: mono.color.text, fontSize: 22 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  saveBtn: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '800' },
  saveOff: { color: mono.color.textTertiary },
  intro: { color: mono.color.textSecondary, fontSize: mono.font.small, lineHeight: 19, marginTop: 8, marginBottom: 6 },
  label: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', marginTop: 18, marginBottom: 8 },
  req: { color: mono.color.accentLight },
  input: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  area: { minHeight: 88, textAlignVertical: 'top' },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 12, borderRadius: mono.radius.md, backgroundColor: mono.color.surface, borderWidth: 1, borderColor: mono.color.borderSoft, alignItems: 'center' },
  segOn: { backgroundColor: mono.color.accent, borderColor: mono.color.accent },
  segText: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '600' },
  segTextOn: { color: '#fff', fontWeight: '700' },
  hint: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 8 },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 16, textAlign: 'center' },
})
