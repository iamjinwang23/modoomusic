import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import type { Song } from '@mono/shared'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getSelectedPost } from '@/lib/selected-post'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

const MAX = 2000
const MAX_IMAGES = 10
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? ''

// 글쓰기 — 커뮤니티에 텍스트 + 공개 곡 첨부(POST /api/communities/[id]/posts).
// 멤버만 진입(상세에서 게이팅). 이미지·투표는 후속.
export default function ComposeScreen() {
  const insets = useSafeAreaInsets()
  const { communityId, postId } = useLocalSearchParams<{ communityId: string; postId?: string }>()
  const editing = !!postId
  const [content, setContent] = useState(() => (postId ? (getSelectedPost()?.content ?? '') : ''))
  const [song, setSong] = useState<Song | null>(null)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [pollOptions, setPollOptions] = useState<string[] | null>(null)
  const [picker, setPicker] = useState(false)
  const [mySongs, setMySongs] = useState<Song[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pollFilled = pollOptions ? pollOptions.map((o) => o.trim()).filter(Boolean) : []
  const pollReady = pollFilled.length >= 2
  const canPost = (content.trim().length > 0 || !!song || images.length > 0 || pollReady) && !busy && !uploading

  // 이미지 선택 + 업로드(multipart 'files' → { urls })
  const pickImages = useCallback(async () => {
    if (!communityId || images.length >= MAX_IMAGES) return
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_IMAGES - images.length, quality: 0.9,
    })
    if (res.canceled || !res.assets?.length) return
    setUploading(true); setError(null)
    try {
      const fd = new FormData()
      res.assets.forEach((a, i) => fd.append('files', { uri: a.uri, name: a.fileName ?? `image${i}.jpg`, type: a.mimeType ?? 'image/jpeg' } as unknown as Blob))
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch(`${API_BASE}/api/communities/${communityId}/post-images`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
      })
      const j = await r.json().catch(() => ({})) as { urls?: string[] }
      if (r.ok && Array.isArray(j.urls)) setImages((prev) => [...prev, ...j.urls!].slice(0, MAX_IMAGES))
      else setError('이미지 업로드에 실패했어요')
    } catch { setError('이미지 업로드에 실패했어요') } finally { setUploading(false) }
  }, [communityId, images.length])

  // 공개된 내 곡만 첨부 가능(서버가 song_not_public 거부)
  const loadSongs = useCallback(async () => {
    try {
      const j = await api.get('/api/songs/mine') as { songs?: Song[] }
      setMySongs((j.songs ?? []).filter((s) => s.published && s.audioUrl))
    } catch {
      setMySongs([])
    }
  }, [])
  useEffect(() => { if (picker && mySongs === null) loadSongs() }, [picker, mySongs, loadSongs])

  const submit = async () => {
    if (!canPost || !communityId) return
    setBusy(true); setError(null)
    try {
      if (editing) {
        // 수정 — 본문만(첨부는 서버 보존). PATCH /community-posts/[postId]
        await api.patch(`/api/community-posts/${postId}`, { content: content.trim() })
      } else {
        await api.post(`/api/communities/${communityId}/posts`, {
          content: content.trim(),
          songId: song?.id ?? null,
          imageUrls: images,
          pollOptions: pollReady ? pollFilled : [],
        })
      }
      router.back()
    } catch (e) {
      const err = e as { error?: string; status?: number }
      const msg = err.error === 'banned_word' ? '사용할 수 없는 단어가 있어요'
        : err.error === 'not_member' ? '멤버만 글을 쓸 수 있어요'
        : err.error === 'song_not_public' ? '공개된 곡만 첨부할 수 있어요'
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
          <Text style={styles.title}>{editing ? '수정' : '글쓰기'}</Text>
          <Pressable onPress={submit} disabled={!canPost} hitSlop={12}>
            <Text style={[styles.post, !canPost && styles.postOff]}>{busy ? (editing ? '저장 중' : '게시 중') : (editing ? '저장' : '게시')}</Text>
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

        {/* 첨부 툴바 — 이미지 · 곡 · 투표 (수정 모드에선 본문만) */}
        {!editing ? (
        <>
        <View style={styles.toolbar}>
          <Pressable style={styles.attachBtn} onPress={pickImages} disabled={uploading || images.length >= MAX_IMAGES}>
            {uploading ? <ActivityIndicator size="small" color={mono.color.textSecondary} /> : (
              <>
                <Icon name="photo.album" size={14} color={mono.color.textSecondary} />
                <Text style={styles.attachText}>사진</Text>
              </>
            )}
          </Pressable>
          {!song ? (
            <Pressable style={styles.attachBtn} onPress={() => setPicker((v) => !v)}>
              <Icon name="music.note" size={14} color={mono.color.textSecondary} />
              <Text style={styles.attachText}>내 곡</Text>
            </Pressable>
          ) : null}
          {!pollOptions ? (
            <Pressable style={styles.attachBtn} onPress={() => setPollOptions(['', ''])}>
              <Icon name="poll" size={14} color={mono.color.textSecondary} />
              <Text style={styles.attachText}>투표</Text>
            </Pressable>
          ) : null}
        </View>

        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {images.map((uri) => (
              <View key={uri} style={styles.thumb}>
                <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />
                <Pressable onPress={() => setImages((prev) => prev.filter((u) => u !== uri))} style={styles.thumbRemove} hitSlop={6}>
                  <Text style={styles.thumbRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {song ? (
          <View style={styles.attached}>
            <View style={styles.attachedCover}>
              {song.coverImage ? <Image source={{ uri: song.coverImage }} style={styles.cover} contentFit="cover" /> : null}
            </View>
            <Text style={styles.attachedTitle} numberOfLines={1}>♪ {song.title ?? '내 곡'}</Text>
            <Pressable onPress={() => setSong(null)} hitSlop={8}><Text style={styles.removeAttach}>✕</Text></Pressable>
          </View>
        ) : null}

        {pollOptions ? (
          <View style={styles.pollEditor}>
            <View style={styles.pollHeader}>
              <Text style={styles.pollLabel}>투표</Text>
              <Pressable onPress={() => setPollOptions(null)} hitSlop={8}><Text style={styles.removeAttach}>✕</Text></Pressable>
            </View>
            {pollOptions.map((opt, i) => (
              <View key={i} style={styles.pollRow}>
                <TextInput
                  style={styles.pollInput}
                  value={opt}
                  onChangeText={(t) => setPollOptions((prev) => prev?.map((o, j) => (j === i ? t : o)) ?? prev)}
                  placeholder={`선택지 ${i + 1}`}
                  placeholderTextColor={mono.color.textTertiary}
                  maxLength={40}
                />
                {pollOptions.length > 2 ? (
                  <Pressable onPress={() => setPollOptions((prev) => prev?.filter((_, j) => j !== i) ?? prev)} hitSlop={8}><Text style={styles.removeAttach}>✕</Text></Pressable>
                ) : null}
              </View>
            ))}
            {pollOptions.length < 4 ? (
              <Pressable onPress={() => setPollOptions((prev) => (prev ? [...prev, ''] : prev))} style={styles.pollAdd}>
                <Text style={styles.pollAddText}>+ 선택지 추가</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {picker && !song ? (
          <View style={styles.pickerBox}>
            <FlatList
              data={mySongs ?? []}
              keyExtractor={(s) => s.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.songRow} onPress={() => { setSong(item); setPicker(false) }}>
                  <View style={styles.songRowCover}>
                    {item.coverImage ? <Image source={{ uri: item.coverImage }} style={styles.cover} contentFit="cover" /> : null}
                  </View>
                  <Text style={styles.songRowTitle} numberOfLines={1}>{item.title ?? '제목 없음'}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>
                  {mySongs === null ? '불러오는 중…' : '공개된 곡이 없어요\n플레이어에서 곡을 공개하면 첨부할 수 있어요'}
                </Text>
              }
              style={{ maxHeight: 220 }}
            />
          </View>
        ) : null}
        </>
        ) : null}

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
    minHeight: 120, color: mono.color.text, fontSize: mono.font.body, lineHeight: 22,
    textAlignVertical: 'top', paddingTop: 4,
  },
  toolbar: { flexDirection: 'row', gap: 8, marginTop: 8 },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', backgroundColor: mono.color.fill, borderRadius: mono.radius.pill,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  attachText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  // 첨부 이미지 썸네일
  thumbRow: { gap: 8, paddingVertical: 10 },
  thumb: { width: 72, height: 72, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  thumbImg: { width: '100%', height: '100%' },
  thumbRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  thumbRemoveText: { color: mono.color.onMedia, fontSize: 11, fontWeight: '700' },
  // 투표 에디터
  pollEditor: {
    marginTop: 10, backgroundColor: mono.color.surface, borderRadius: mono.radius.md,
    borderWidth: 1, borderColor: mono.color.borderSoft, padding: 12, gap: 8,
  },
  pollHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pollLabel: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  pollRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pollInput: {
    flex: 1, backgroundColor: mono.color.bg, borderRadius: mono.radius.sm, color: mono.color.text,
    fontSize: mono.font.small, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  pollAdd: { paddingVertical: 4 },
  pollAddText: { color: mono.color.accentLight, fontSize: mono.font.small, fontWeight: '600' },
  attached: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8,
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, padding: 10,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  attachedCover: { width: 40, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  cover: { width: '100%', height: '100%' },
  attachedTitle: { flex: 1, color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  removeAttach: { color: mono.color.textSecondary, fontSize: 16, paddingHorizontal: 4 },
  pickerBox: {
    marginTop: 10, backgroundColor: mono.color.surface, borderRadius: mono.radius.md,
    borderWidth: 1, borderColor: mono.color.borderSoft, overflow: 'hidden',
  },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  songRowCover: { width: 36, height: 36, borderRadius: 6, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  songRowTitle: { flex: 1, color: mono.color.text, fontSize: mono.font.small },
  pickerEmpty: { color: mono.color.textSecondary, fontSize: mono.font.small, textAlign: 'center', padding: 20, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  error: { color: mono.color.danger, fontSize: mono.font.small },
  count: { color: mono.color.textTertiary, fontSize: mono.font.small },
})
