import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Button } from '@/components/ui/button'
import { generateVideoCover, VIDEO_TIERS, type VideoTier } from '@/lib/video'
import { mono } from '@/theme/mono'

// 영상 만들기 — 곡 커버를 움직이는 영상으로(image_to_video). tier·모션 프롬프트.
export default function VideoCreateScreen() {
  const insets = useSafeAreaInsets()
  const { songId } = useLocalSearchParams<{ songId: string }>()
  const [tier, setTier] = useState<VideoTier>('basic')
  const [motion, setMotion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!songId || busy) return
    setBusy(true); setError(null)
    try {
      await generateVideoCover(songId, { tier, motionPrompt: motion })
      router.back()
    } catch (e) {
      const err = e as { error?: string; status?: number }
      setError(
        err.error === 'insufficient' ? '크레딧이 부족해요'
          : err.error === 'already_generating' ? '이미 생성 중이에요'
          : err.error === 'rate_limited' ? '잠시 후 다시 시도해주세요'
          : err.status === 401 ? '로그인이 필요해요' : '영상 생성에 실패했어요',
      )
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          <Text style={styles.title}>영상 만들기</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.desc}>곡 커버 이미지를 움직이는 영상으로 만들어요.</Text>

        <Text style={styles.label}>화질</Text>
        <View style={styles.tiers}>
          {VIDEO_TIERS.map((t) => {
            const on = tier === t.id
            return (
              <Pressable key={t.id} onPress={() => setTier(t.id)} style={[styles.tier, on && styles.tierOn]}>
                <Text style={[styles.tierLabel, on && styles.tierLabelOn]}>{t.label}</Text>
                <Text style={styles.tierCredits}>{t.credits} 크레딧</Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={styles.label}>움직임 (선택)</Text>
        <TextInput
          style={[styles.input, styles.motion]}
          placeholder="예: 천천히 줌인, 반짝이는 빛"
          placeholderTextColor={mono.color.textTertiary}
          value={motion}
          onChangeText={setMotion}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <Button label={busy ? '만드는 중…' : '영상 만들기'} onPress={submit} loading={busy} />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  close: { color: mono.color.text, fontSize: 22 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  desc: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 4 },
  label: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', marginTop: 22, marginBottom: 10 },
  tiers: { gap: 10 },
  tier: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, padding: 14,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  tierOn: { borderColor: mono.color.accent, backgroundColor: mono.color.surface2 },
  tierLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  tierLabelOn: { color: mono.color.accentLight },
  tierCredits: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  input: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  motion: { minHeight: 70, textAlignVertical: 'top' },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 16, textAlign: 'center' },
  footer: { marginTop: 'auto', paddingTop: 12 },
})
