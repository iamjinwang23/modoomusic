import { useState } from 'react'
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Button } from '@/components/ui/button'
import { generateSong, MUSIC_MODELS, type MusicModelId } from '@/lib/generate'
import { mono } from '@/theme/mono'

// 음악 만들기 — 스타일/가사/모델 입력 → POST /api/generate.
// 성공 시 라이브러리로 복귀(생성 중 곡이 실시간으로 완성됨).
export default function CreateScreen() {
  const insets = useSafeAreaInsets()
  const [prompt, setPrompt] = useState('')
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [instrumental, setInstrumental] = useState(false)
  const [model, setModel] = useState<MusicModelId>('music-2.6')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = prompt.trim().length > 0 && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    try {
      await generateSong({
        prompt: prompt.trim(),
        title: title.trim() || undefined,
        customLyrics: instrumental ? undefined : lyrics.trim() || undefined,
        instrumental,
        autoLyrics: !instrumental && lyrics.trim().length === 0,
        model,
      })
      router.replace('/')
    } catch (e) {
      const err = e as { error?: string; status?: number }
      setError(err.error ?? (err.status === 401 ? '로그인이 필요해요' : '생성에 실패했어요'))
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
          <Text style={styles.h1}>음악 만들기</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>스타일 · 분위기</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="예: 잔잔한 로파이 힙합, 비 오는 밤"
            placeholderTextColor={mono.color.textTertiary}
            value={prompt}
            onChangeText={setPrompt}
            multiline
          />

          <Text style={styles.label}>제목 (선택)</Text>
          <TextInput
            style={styles.input}
            placeholder="비워두면 자동으로 지어져요"
            placeholderTextColor={mono.color.textTertiary}
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>연주곡 (보컬 없음)</Text>
              <Text style={styles.hint}>켜면 가사 없이 인스트루멘탈로 만들어요</Text>
            </View>
            <Switch
              value={instrumental}
              onValueChange={setInstrumental}
              trackColor={{ true: mono.color.accent, false: mono.color.fillStrong }}
              thumbColor="#fff"
            />
          </View>

          {!instrumental && (
            <>
              <Text style={styles.label}>가사 (선택)</Text>
              <TextInput
                style={[styles.input, styles.lyrics]}
                placeholder="비워두면 스타일에 맞춰 자동으로 작사해요"
                placeholderTextColor={mono.color.textTertiary}
                value={lyrics}
                onChangeText={setLyrics}
                multiline
              />
            </>
          )}

          <Text style={styles.label}>모델</Text>
          <View style={styles.models}>
            {MUSIC_MODELS.map((m) => {
              const on = model === m.id
              return (
                <Pressable key={m.id} onPress={() => setModel(m.id)} style={[styles.model, on && styles.modelOn]}>
                  <View style={styles.flex}>
                    <Text style={[styles.modelLabel, on && styles.modelLabelOn]}>{m.label}</Text>
                    <Text style={styles.modelDesc}>{m.desc}</Text>
                  </View>
                  <Text style={[styles.credits, on && styles.modelLabelOn]}>{m.credits} 크레딧</Text>
                </Pressable>
              )
            })}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <Button label={busy ? '만드는 중…' : '만들기'} onPress={submit} loading={busy} disabled={!canSubmit} />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  close: { color: mono.color.text, fontSize: 22, width: 24 },
  h1: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  label: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', marginTop: 18, marginBottom: 8 },
  hint: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
  input: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  lyrics: { minHeight: 120, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  models: { gap: 10 },
  model: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, padding: 14,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  modelOn: { borderColor: mono.color.accent, backgroundColor: mono.color.surface2 },
  modelLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  modelLabelOn: { color: mono.color.accentLight },
  modelDesc: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 2 },
  credits: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 16, textAlign: 'center' },
  footer: { paddingTop: 8 },
})
