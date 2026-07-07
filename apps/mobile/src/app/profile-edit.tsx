import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { mono } from '@/theme/mono'

const NAME_MAX = 20
const BIO_MAX = 150

// 프로필 편집 — 표시명·소개(profiles RLS 소유자 update). 유저명·아바타는 후속.
export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from('profiles').select('display_name, bio').eq('id', user.id).maybeSingle()
      setName((data?.display_name as string) ?? '')
      setBio((data?.bio as string) ?? '')
      setLoading(false)
    })()
  }, [])

  const save = async () => {
    if (busy || loading) return
    setBusy(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 필요해요'); setBusy(false); return }
    const finalName = name.trim() || null
    const finalBio = bio.trim() || null
    const { error: dbError } = await supabase.from('profiles').update({ display_name: finalName, bio: finalBio }).eq('id', user.id)
    if (dbError) { setError('저장에 실패했어요'); setBusy(false); return }
    await supabase.auth.updateUser({ data: { full_name: finalName } }).catch(() => {})
    router.back()
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          <Text style={styles.title}>프로필 편집</Text>
          <Pressable onPress={save} disabled={busy || loading} hitSlop={12}>
            <Text style={[styles.save, (busy || loading) && styles.saveOff]}>{busy ? '저장 중' : '저장'}</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>표시명</Text>
        <TextInput
          style={styles.input}
          placeholder="이름"
          placeholderTextColor={mono.color.textTertiary}
          value={name}
          onChangeText={(t) => t.length <= NAME_MAX && setName(t)}
        />

        <Text style={styles.label}>소개</Text>
        <TextInput
          style={[styles.input, styles.bio]}
          placeholder="자기소개를 적어보세요"
          placeholderTextColor={mono.color.textTertiary}
          value={bio}
          onChangeText={(t) => t.length <= BIO_MAX && setBio(t)}
          multiline
        />
        <Text style={styles.count}>{bio.length}/{BIO_MAX}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  close: { color: mono.color.text, fontSize: 22 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  save: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '800' },
  saveOff: { color: mono.color.textTertiary },
  label: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  bio: { minHeight: 100, textAlignVertical: 'top' },
  count: { color: mono.color.textTertiary, fontSize: mono.font.small, textAlign: 'right', marginTop: 6 },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 16, textAlign: 'center' },
})
