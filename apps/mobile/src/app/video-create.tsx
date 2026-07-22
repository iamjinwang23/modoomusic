import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import Svg, { Path } from 'react-native-svg'
import { Icon } from '@/components/ui/icon'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { generateVideoCover, VIDEO_TIERS, type VideoTier, type VideoMode } from '@/lib/video'
import { getNowPlaying, setNowPlaying } from '@/lib/now-playing'
import { watchVideoSong } from '@/lib/video-poll'
import { api } from '@/lib/api'
import { toast } from '@/lib/toast'
import { mono } from '@/theme/mono'

// 영상 만들기 — 이미지→영상(커버/교체 이미지) 또는 텍스트→영상(장면 묘사). tier·프롬프트.
export default function VideoCreateScreen() {
  const insets = useSafeAreaInsets()
  const { songId, cover } = useLocalSearchParams<{ songId: string; cover?: string }>()
  const [mode, setMode] = useState<VideoMode>('image_to_video')
  const [tier, setTier] = useState<VideoTier>('basic')
  const [motion, setMotion] = useState('')
  const [textPrompt, setTextPrompt] = useState('')
  const [customImage, setCustomImage] = useState<{ uri: string; data: string } | null>(null)
  const [imgBusy, setImgBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tierSheet, setTierSheet] = useState(false)
  const [kbHeight, setKbHeight] = useState(0)
  // 비디오 무료 체험권 잔여(웹 파리티). 있으면 CTA·안내에 '무료'로 표시.
  const [videoTrial, setVideoTrial] = useState(0)
  const activeTier = VIDEO_TIERS.find((t) => t.id === tier)!
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKbHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  useEffect(() => {
    (api.get('/api/credits/me') as Promise<{ videoTrial?: number } | null>)
      .then((c) => setVideoTrial(c?.videoTrial ?? 0))
      .catch(() => {})
  }, [])

  const sourceImage = customImage?.uri ?? (cover || null)

  // first frame 교체 이미지 선택 → data URL(base64). 서버 4MB 제한.
  const pickImage = async () => {
    if (imgBusy) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { toast.error('사진 접근 권한이 필요해요'); return }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.7 })
    if (res.canceled || !res.assets?.[0]) return
    const a = res.assets[0]
    setImgBusy(true)
    try {
      const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 })
      if (b64.length > 3_800_000) { toast.error('이미지가 너무 커요. 더 작은 사진을 선택해 주세요'); return }
      const mime = a.mimeType ?? 'image/jpeg'
      setCustomImage({ uri: a.uri, data: `data:${mime};base64,${b64}` })
    } catch { toast.error('이미지를 불러오지 못했어요') } finally { setImgBusy(false) }
  }

  const submit = async () => {
    if (!songId || busy) return
    if (mode === 'text_to_video' && !textPrompt.trim()) { setError('장면을 묘사해 주세요'); return }
    setBusy(true); setError(null)
    try {
      await generateVideoCover(songId, { mode, tier, motionPrompt: motion, textPrompt, imageData: customImage?.data })
      watchVideoSong(songId) // 폴러가 완료까지 추적 → 서버 finalize 트리거
      // 현재 재생 중인 곡이면 즉시 '생성 중'으로 반영 → 플레이어 중앙 표시가 바로 뜸(닫았다 열 필요 없음)
      const cur = getNowPlaying()
      if (cur && cur.id === songId) setNowPlaying({ ...cur, videoCoverStatus: 'generating' })
      toast.success('영상을 만들고 있어요', { description: '완성까지 몇 분 정도 걸려요' })
      router.back()
    } catch (e) {
      const err = e as { error?: string; status?: number }
      setError(
        err.error === 'insufficient' ? '크레딧이 부족해요'
          : err.error === 'already_generating' ? '이미 생성 중이에요'
          : err.error === 'rate_limited' ? '잠시 후 다시 시도해주세요'
          : err.error === 'image_too_large' ? '이미지가 너무 커요'
          : err.status === 401 ? '로그인이 필요해요' : '영상 생성에 실패했어요',
      )
      setBusy(false)
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
        <Text style={styles.title} pointerEvents="none">영상 만들기</Text>
        <Pressable onPress={() => setTierSheet(true)} style={styles.tierPill} hitSlop={6}>
          <Text style={styles.tierChipName}>{activeTier.res}</Text>
          <Icon name="chevron.down" size={14} color={mono.color.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
        {/* 모드 탭 — 이미지→영상 / 텍스트→영상 */}
        <View style={styles.modeRow}>
          {([['image_to_video', '이미지 → 영상'], ['text_to_video', '텍스트 → 영상']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={[styles.modeTab, mode === k && styles.modeTabOn]}>
              <Text style={[styles.modeText, mode === k && styles.modeTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'image_to_video' ? (
          <>
            <View style={styles.imgRowCenter}>
              <Pressable onPress={pickImage} style={styles.imgBox} disabled={imgBusy}>
                {sourceImage ? <Image source={{ uri: sourceImage }} style={styles.imgPreview} /> : <View style={styles.imgPreview} />}
                <View style={styles.imgBadge}>
                  {imgBusy ? <ActivityIndicator size="small" color={mono.color.onMedia} /> : <Text style={styles.imgBadgeText}>{customImage ? '이미지 교체됨' : '이미지 교체'}</Text>}
                </View>
              </Pressable>
            </View>
            <TextInput style={[styles.input, styles.area, styles.motionInput]} placeholder="커버 이미지가 어떻게 움직이기를 원하는지 설명해 주세요" placeholderTextColor={mono.color.textTertiary} value={motion} onChangeText={setMotion} multiline />
            <Text style={styles.descBelow}>곡 커버를 6초짜리 영상으로 만들 수 있어요.</Text>
          </>
        ) : (
          <>
            <TextInput style={[styles.input, styles.area, styles.textModeInput]} placeholder="어떤 장면의 영상을 원하는지 설명해 주세요" placeholderTextColor={mono.color.textTertiary} value={textPrompt} onChangeText={setTextPrompt} multiline autoFocus />
            <Text style={styles.descBelow}>장면을 묘사하면 그대로 6초짜리 영상을 만들어요.</Text>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: kbHeight > 0 ? kbHeight + 8 : insets.bottom + 8 }]}>
        {/* CTA — 웹 파리티: 영상 만들기 + ✦ (체험권 있으면 '무료', 없으면 화질별 크레딧) */}
        <Pressable
          onPress={busy ? undefined : submit}
          style={({ pressed }) => [styles.cta, busy && styles.ctaOff, pressed && !busy && styles.ctaPressed]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.ctaRow}>
              <Text style={styles.ctaLabel}>영상 만들기</Text>
              <Icon name="sparkle" size={15} color={mono.color.text} />
              <Text style={styles.ctaValue}>{videoTrial > 0 ? '무료' : activeTier.credits}</Text>
            </View>
          )}
        </Pressable>
        {videoTrial > 0 ? <Text style={styles.trialNote}>무료 체험권 {videoTrial}회 남음</Text> : null}
      </View>

      {/* 화질 선택 — 하단 바텀시트(만들기 모델선택 패리티) */}
      <BottomSheet open={tierSheet} onClose={() => setTierSheet(false)} sheetStyle={styles.tierSheet}>
        <Text style={styles.tierSheetTitle}>화질 선택</Text>
        {VIDEO_TIERS.map((t) => {
          const on = tier === t.id
          return (
            <Pressable key={t.id} onPress={() => { setTier(t.id); setTierSheet(false) }} style={({ pressed }) => [styles.tierRow, pressed && styles.tierRowPressed]}>
              <View style={styles.tierHead}>
                <Text style={styles.tierRowName}>{t.name}</Text>
                <Text style={styles.tierBadge}>{t.res}</Text>
              </View>
              <View style={styles.tierSelectRight}>
                <View style={styles.creditPill}>
                  <Icon name="sparkle" size={13} color={mono.color.text} />
                  <Text style={styles.tierCredits}>{t.credits}</Text>
                </View>
                <View style={[styles.tierCheck, on && styles.tierCheckOn]}>
                  {on ? (
                    <Svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 6L9 17l-5-5" /></Svg>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )
        })}
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  close: { color: mono.color.text, fontSize: 22 },
  title: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  modeRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: mono.color.borderSoft, marginBottom: 4 },
  modeTab: { flex: 1, alignItems: 'center', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  modeTabOn: { borderBottomColor: mono.color.text },
  modeText: { color: mono.color.textTertiary, fontSize: mono.font.body, fontWeight: '700' },
  modeTextOn: { color: mono.color.text },
  imgRowCenter: { alignItems: 'center', marginTop: 20 },
  motionInput: { marginTop: 16 },
  textModeInput: { marginTop: 20 },
  descBelow: { color: mono.color.textTertiary, fontSize: mono.font.small, marginTop: 10, marginLeft: 2 },
  imgBox: { width: 84, aspectRatio: 3 / 4, borderRadius: mono.radius.md, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  imgPreview: { width: '100%', height: '100%' },
  imgBadge: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingVertical: 5, backgroundColor: 'rgba(0,0,0,0.55)' },
  imgBadgeText: { color: mono.color.onMedia, fontSize: 11, fontWeight: '600' },
  // 화질 pill — 헤더 우측(만들기 화면 상단 모델선택 pill 패턴)
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 12, paddingVertical: 9 },
  tierChipName: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  tierSelectRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // 해상도 배지 — 곡 리스트 모델 배지(v2.6)와 동일 스타일
  tierBadge: { color: mono.color.accentLight, fontSize: 10, fontWeight: '700', backgroundColor: 'rgba(124,58,237,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tierCredits: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  // 화질 선택 바텀시트
  tierSheet: { paddingHorizontal: 20 },
  tierSheetTitle: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', marginBottom: 8 },
  tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderRadius: mono.radius.md },
  tierRowPressed: { backgroundColor: mono.color.fill },
  tierRowName: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  tierCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: mono.color.fillStrong, alignItems: 'center', justifyContent: 'center' },
  tierCheckOn: { backgroundColor: mono.color.accent, borderColor: mono.color.accent },
  input: {
    backgroundColor: mono.color.surface, borderRadius: mono.radius.md, color: mono.color.text,
    fontSize: mono.font.body, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: mono.color.borderSoft,
  },
  area: { minHeight: 88, maxHeight: 132, textAlignVertical: 'top', paddingTop: 12, lineHeight: 22 },
  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 16, textAlign: 'center' },
  footer: { paddingTop: 12 },
  // CTA — Button primary 스타일 + 아이콘/값 슬롯(웹 파리티)
  cta: { backgroundColor: mono.color.accent, borderRadius: mono.radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { opacity: 0.5 },
  ctaPressed: { opacity: 0.85 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ctaLabel: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  ctaValue: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
  trialNote: { color: mono.color.textTertiary, fontSize: mono.font.small, textAlign: 'center', marginTop: 10 },
})
