import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Icon } from '@/components/ui/icon'
import { setSongPublished } from '@/lib/song-actions'
import { toast } from '@/lib/toast'
import { mono } from '@/theme/mono'

type PublishSong = { id: string; title: string | null; publishComment?: string | null; coverImage?: string; coverHue?: number }

// 곡 공개 — 코멘트 입력 후 공개하기(웹 PublishModal 패리티). 공개 성공 시 스낵바.
export function PublishSheet({ open, onClose, song, onPublished }: {
  open: boolean
  onClose: () => void
  song: PublishSong | null
  onPublished?: (publishComment: string | null) => void
}) {
  const insets = useSafeAreaInsets()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  // 열릴 때 기존 코멘트로 초기화(다시 공개 시)
  useEffect(() => { if (open && song) setComment(song.publishComment ?? '') }, [open, song])

  const hue = song?.coverHue ?? (song ? (song.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 137) % 360 : 250)
  const h2 = (hue + 55) % 360

  const publish = async () => {
    if (!song || busy) return
    setBusy(true)
    const c = comment.trim() || null
    const ok = await setSongPublished(song.id, true, c)
    setBusy(false)
    if (ok) { onPublished?.(c); onClose(); toast.success('곡이 공개되었어요') }
    else toast.error('공개에 실패했어요')
  }

  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>공개하기</Text>
        <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={22} color={mono.color.textSecondary} /></Pressable>
      </View>

      {/* 커버 + 제목 */}
      <View style={styles.row}>
        <View style={styles.cover}>
          {song?.coverImage ? (
            <Image source={{ uri: song.coverImage }} style={styles.coverImg} contentFit="cover" />
          ) : (
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="pubcov" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={`hsl(${hue}, 65%, 48%)`} />
                  <Stop offset="1" stopColor={`hsl(${h2}, 55%, 32%)`} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#pubcov)" />
            </Svg>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={styles.songTitle} numberOfLines={2}>{song?.title || '제목 없음'}</Text>
          <Text style={styles.hint}>둘러보기에 공개돼 다른 사람도 들을 수 있어요</Text>
        </View>
      </View>

      <TextInput
        style={styles.input}
        value={comment}
        onChangeText={setComment}
        placeholder="이 음악에 대한 코멘트를 남겨보세요 (선택)"
        placeholderTextColor={mono.color.textTertiary}
        multiline
        maxLength={300}
      />

      <Pressable onPress={publish} disabled={busy} style={[styles.cta, busy && styles.ctaOff]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>공개하기</Text>}
      </Pressable>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, maxHeight: '86%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cover: { width: 64, aspectRatio: 3 / 4, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  coverImg: { width: '100%', height: '100%' },
  meta: { flex: 1, gap: 4 },
  songTitle: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  hint: { color: mono.color.textTertiary, fontSize: mono.font.small },
  input: {
    color: mono.color.text, fontSize: mono.font.body, marginTop: 16, minHeight: 96, textAlignVertical: 'top',
    backgroundColor: mono.color.surface2, borderRadius: mono.radius.md, paddingHorizontal: 14, paddingVertical: 12, lineHeight: 22,
  },
  cta: {
    marginTop: 16, height: 52, borderRadius: mono.radius.pill, backgroundColor: mono.color.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaOff: { opacity: 0.5 },
  ctaText: { color: '#fff', fontSize: mono.font.body, fontWeight: '700' },
})
