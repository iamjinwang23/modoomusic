import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import type { Collection } from '@mono/shared'

// 라이브러리 Song·플레이어 NowPlaying 모두 만족하는 최소 타입
export type PickerSong = { id: string; title: string | null; coverImage?: string; coverHue?: number; prompt?: string }
import { collections } from '@/lib/collection'
import { getCachedDisplayName } from '@/lib/me'
import { hapticLight } from '@/lib/haptics'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { CollectionCover } from '@/components/ui/collection-cover'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

function hueFrom(id: string): number {
  return (id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 137) % 360
}

export function CollectionPickerModal({ open, song, onClose }: { open: boolean; song: PickerSong | null; onClose: () => void }) {
  const [cols, setCols] = useState<Collection[]>([])
  const [inIds, setInIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    if (!open || !song) return
    setCreating(false); setNewName('')
    collections.ensureDefault().then(setCols)
    collections.getSongCollectionIds(song.id).then((ids) => setInIds(new Set(ids)))
  }, [open, song])

  if (!song) return null

  const toggle = async (collectionId: string) => {
    hapticLight()
    if (inIds.has(collectionId)) {
      await collections.removeSong(collectionId, song.id)
      setInIds((prev) => { const s = new Set(prev); s.delete(collectionId); return s })
    } else {
      await collections.addSong(collectionId, song.id)
      setInIds((prev) => new Set([...prev, collectionId]))
    }
    setCols(await collections.getAll())
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    hapticLight()
    const col = await collections.create(name)
    await collections.addSong(col.id, song.id)
    setInIds((prev) => new Set([...prev, col.id]))
    setCols(await collections.getAll())
    setNewName(''); setCreating(false)
  }

  const songHue = song.coverHue ?? hueFrom(song.id)
  const songH2 = (songHue + 55) % 360
  const ownerName = getCachedDisplayName() ?? '내 음악'
  const songTitle = song.title?.trim() || song.prompt?.slice(0, 30) || '내 곡'

  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.head}>
        <Text style={styles.title}>컬렉션에 담기</Text>
        <Pressable onPress={onClose} hitSlop={10}><Icon name="close" size={20} color={mono.color.textSecondary} /></Pressable>
      </View>

      {/* 곡 정보 */}
      <View style={styles.songRow}>
        <View style={styles.songCover}>
          {song.coverImage ? (
            <Image source={{ uri: song.coverImage }} style={styles.songCoverImg} contentFit="cover" />
          ) : (
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="pickcov" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={`hsl(${songHue}, 65%, 48%)`} />
                  <Stop offset="1" stopColor={`hsl(${songH2}, 55%, 32%)`} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#pickcov)" />
            </Svg>
          )}
        </View>
        <View style={styles.flex}>
          <Text style={styles.songTitle} numberOfLines={1}>{songTitle}</Text>
          <Text style={styles.owner} numberOfLines={1}>{ownerName}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* 컬렉션 목록 */}
      <View style={styles.list}>
        {cols.map((col) => {
          const active = inIds.has(col.id)
          return (
            <Pressable key={col.id} onPress={() => toggle(col.id)} style={({ pressed }) => [styles.colRow, pressed && styles.colRowPressed]}>
              <CollectionCover collection={col} />
              <View style={styles.flex}>
                <Text style={styles.colName} numberOfLines={1}>{col.name}</Text>
                <Text style={styles.colCount}>{col.songIds.length}곡</Text>
              </View>
              <View style={[styles.check, active && styles.checkOn]}>
                {active ? (
                  <Svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M20 6L9 17l-5-5" />
                  </Svg>
                ) : null}
              </View>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.divider} />

      {/* 새 컬렉션 */}
      <View style={styles.createWrap}>
        {creating ? (
          <View style={styles.createRow}>
            <TextInput
              autoFocus
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={handleCreate}
              placeholder="컬렉션 이름"
              placeholderTextColor={mono.color.textTertiary}
              style={styles.input}
              returnKeyType="done"
            />
            <Pressable onPress={handleCreate} style={styles.addBtn}><Text style={styles.addBtnText}>추가</Text></Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setCreating(true)} style={styles.newBtn} hitSlop={6}>
            <Text style={styles.newBtnPlus}>+</Text>
            <Text style={styles.newBtnText}>새 컬렉션 만들기</Text>
          </Pressable>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  sheet: { paddingHorizontal: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  songCover: { width: 48, aspectRatio: 2 / 3, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  songCoverImg: { width: '100%', height: '100%' },
  songTitle: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  owner: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: mono.color.borderSoft },
  list: { paddingVertical: 4 },
  colRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  colRowPressed: { backgroundColor: mono.color.fill },
  colName: { color: mono.color.text, fontSize: mono.font.body },
  colCount: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 2 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: mono.color.fillStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: mono.color.accent, borderColor: mono.color.accent },
  createWrap: { paddingHorizontal: 20, paddingVertical: 12 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: mono.color.fill, borderRadius: mono.radius.md, color: mono.color.text, fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 10 },
  addBtn: { backgroundColor: mono.color.accent, borderRadius: mono.radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontSize: mono.font.body, fontWeight: '700' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  newBtnPlus: { color: mono.color.accentLight, fontSize: 18, fontWeight: '600' },
  newBtnText: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '600' },
})
