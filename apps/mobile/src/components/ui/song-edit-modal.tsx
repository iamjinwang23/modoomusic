import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Icon } from '@/components/ui/icon'
import { updateSong } from '@/lib/song-actions'
import { mono } from '@/theme/mono'

type EditSong = { id: string; title: string | null; lyrics: string | null; publishComment: string | null }

// 곡 수정 — 제목·공개코멘트·가사. 웹 SongEditModal 패리티(커버 편집은 제외).
export function SongEditModal({ open, onClose, song, onSaved }: {
  open: boolean
  onClose: () => void
  song: EditSong | null
  onSaved?: (patch: { title: string | null; lyrics: string | null; publishComment: string | null }) => void
}) {
  const insets = useSafeAreaInsets()
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [busy, setBusy] = useState(false)

  // 열릴 때 현재 값으로 초기화
  useEffect(() => {
    if (open && song) { setTitle(song.title ?? ''); setComment(song.publishComment ?? ''); setLyrics(song.lyrics ?? '') }
  }, [open, song])

  const save = async () => {
    if (!song || busy) return
    setBusy(true)
    const patch = { title: title.trim() || null, lyrics: lyrics.trim() || null, publishComment: comment.trim() || null }
    const ok = await updateSong(song.id, patch)
    setBusy(false)
    if (ok) { onSaved?.(patch); onClose() }
  }

  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>곡 수정</Text>
        <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={22} color={mono.color.textSecondary} /></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.body}>
        <Text style={styles.field}>제목</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="곡 제목" placeholderTextColor={mono.color.textTertiary} maxLength={80} />

        <Text style={styles.field}>공개 코멘트</Text>
        <TextInput style={[styles.input, styles.multiline]} value={comment} onChangeText={setComment} placeholder="둘러보기에 함께 보일 한마디 (선택)" placeholderTextColor={mono.color.textTertiary} multiline maxLength={300} />

        <Text style={styles.field}>가사</Text>
        <TextInput style={[styles.input, styles.lyrics]} value={lyrics} onChangeText={setLyrics} placeholder="가사" placeholderTextColor={mono.color.textTertiary} multiline />
      </ScrollView>
      <Pressable onPress={save} disabled={busy} style={[styles.cta, busy && styles.ctaOff]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>저장</Text>}
      </Pressable>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, maxHeight: '86%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  body: { flexGrow: 0 },
  field: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    color: mono.color.text, fontSize: mono.font.body,
    backgroundColor: mono.color.surface2, borderRadius: mono.radius.md, paddingHorizontal: 14, paddingVertical: 12,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  lyrics: { minHeight: 180, textAlignVertical: 'top', lineHeight: 22 },
  cta: {
    marginTop: 16, height: 52, borderRadius: mono.radius.pill, backgroundColor: mono.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaOff: { opacity: 0.5 },
  ctaText: { color: '#fff', fontSize: mono.font.body, fontWeight: '700' },
})
