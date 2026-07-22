import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Icon } from '@/components/ui/icon'
import { updateSong } from '@/lib/song-actions'
import { uploadSongCover } from '@/lib/profile-image'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { mono } from '@/theme/mono'

type EditSong = { id: string; title: string | null; lyrics: string | null; publishComment: string | null; coverImage?: string; coverHue?: number }

// 곡 수정 — 커버·제목·공개코멘트·가사. 웹 SongEditModal 패리티.
export function SongEditModal({ open, onClose, song, onSaved }: {
  open: boolean
  onClose: () => void
  song: EditSong | null
  onSaved?: (patch: { title: string | null; lyrics: string | null; publishComment: string | null; coverImage?: string }) => void
}) {
  const insets = useSafeAreaInsets()
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  // 열릴 때 현재 값으로 초기화
  useEffect(() => {
    if (open && song) { setTitle(song.title ?? ''); setComment(song.publishComment ?? ''); setLyrics(song.lyrics ?? ''); setCover(song.coverImage ?? null) }
  }, [open, song])

  const hue = song?.coverHue ?? (song ? (song.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 137) % 360 : 250)
  const h2 = (hue + 55) % 360

  const changeCover = async () => {
    if (!song || uploading) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { toast.error('사진 접근 권한이 필요해요'); return }
    // allowsEditing 끔 — iOS는 이 옵션에서 aspect를 무시하고 강제 정방형 크로퍼를 띄워
    // (세로 커버에 부적합) 잘린 정방형이 전체화면 커버에 과하게 확대됨. 원본을 그대로 사용(표시 시 cover-fit).
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
    if (res.canceled || !res.assets?.[0]) return
    const a = res.assets[0]
    setUploading(true)
    const url = await uploadSongCover(song.id, a.uri, a.mimeType ?? 'image/jpeg')
    setUploading(false)
    if (url) { setCover(url); toast.success('커버 이미지가 변경되었어요') }
    else toast.error('커버 이미지 업로드 실패')
  }

  const save = async () => {
    if (!song || busy) return
    setBusy(true)
    const patch = { title: title.trim() || null, lyrics: lyrics.trim() || null, publishComment: comment.trim() || null }
    const ok = await updateSong(song.id, patch)
    // 커버가 바뀌었으면 songs.cover_image도 반영(업로드는 이미 완료, URL만 저장)
    if (ok && cover && cover !== song.coverImage) {
      await supabase.from('songs').update({ cover_image: cover }).eq('id', song.id)
    }
    setBusy(false)
    if (ok) { onSaved?.({ ...patch, coverImage: cover ?? undefined }); onClose(); toast.success('곡 정보를 수정했어요') }
    else toast.error('수정에 실패했어요')
  }

  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>곡 수정</Text>
        <Pressable onPress={onClose} hitSlop={8}><Icon name="close" size={22} color={mono.color.textSecondary} /></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.body}>
        {/* 커버 변경 */}
        <View style={styles.coverRow}>
          <Pressable onPress={changeCover} style={styles.cover} disabled={uploading}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.coverImg} contentFit="cover" />
            ) : (
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id="editcov" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={`hsl(${hue}, 65%, 48%)`} />
                    <Stop offset="1" stopColor={`hsl(${h2}, 55%, 32%)`} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#editcov)" />
              </Svg>
            )}
            <View style={styles.coverBadge}>
              {uploading ? <ActivityIndicator size="small" color={mono.color.onMedia} /> : <Icon name="photo.album" size={14} color={mono.color.onMedia} />}
              <Text style={styles.coverBadgeText}>{uploading ? '올리는 중' : '커버 변경'}</Text>
            </View>
          </Pressable>
        </View>

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
  // 커버 변경 — 세로(3:4) 썸네일 + 하단 배지
  coverRow: { alignItems: 'center', paddingTop: 8 },
  cover: { width: 108, aspectRatio: 3 / 4, borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  coverImg: { width: '100%', height: '100%' },
  coverBadge: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, backgroundColor: 'rgba(0,0,0,0.55)' },
  coverBadgeText: { color: mono.color.onMedia, fontSize: mono.font.small, fontWeight: '600' },
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
