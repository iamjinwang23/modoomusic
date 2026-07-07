import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { api } from '@/lib/api'
import { mono } from '@/theme/mono'

const MAX = 2000

// 글쓰기 — 커뮤니티에 텍스트 글 작성(POST /api/communities/[id]/posts).
// 이미지·투표·곡 첨부는 후속. 멤버만 진입(상세에서 게이팅).
export default function ComposeScreen() {
  const insets = useSafeAreaInsets()
  const { communityId } = useLocalSearchParams<{ communityId: string }>()
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPost = content.trim().length > 0 && !busy

  const submit = async () => {
    if (!canPost || !communityId) return
    setBusy(true); setError(null)
    try {
      await api.post(`/api/communities/${communityId}/posts`, { content: content.trim() })
      router.back()
    } catch (e) {
      const err = e as { error?: string; status?: number }
      const msg = err.error === 'banned_word' ? '사용할 수 없는 단어가 있어요'
        : err.error === 'not_member' ? '멤버만 글을 쓸 수 있어요'
        : err.status === 401 ? '로그인이 필요해요' : '글 작성에 실패했어요'
      setError(msg)
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          <Text style={styles.title}>글쓰기</Text>
          <Pressable onPress={submit} disabled={!canPost} hitSlop={12}>
            <Text style={[styles.post, !canPost && styles.postOff]}>{busy ? '게시 중' : '게시'}</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder="무슨 이야기를 나눠볼까요?"
          placeholderTextColor={mono.color.textTertiary}
          value={content}
          onChangeText={(t) => t.length <= MAX && setContent(t)}
          multiline
          autoFocus
        />
        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : <View />}
          <Text style={styles.count}>{content.length}/{MAX}</Text>
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
  post: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '800' },
  postOff: { color: mono.color.textTertiary },
  input: {
    flex: 1, color: mono.color.text, fontSize: mono.font.body, lineHeight: 22,
    textAlignVertical: 'top', paddingTop: 4,
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  error: { color: mono.color.danger, fontSize: mono.font.small },
  count: { color: mono.color.textTertiary, fontSize: mono.font.small },
})
