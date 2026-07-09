import { useEffect, useRef, useState } from 'react'
import {
  ActionSheetIOS, ActivityIndicator, Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Icon } from '@/components/ui/icon'
import { api } from '@/lib/api'
import { generateSong, MUSIC_MODELS, type MusicModelId } from '@/lib/generate'
import { mono } from '@/theme/mono'

// 웹 SongForm ALL_CHIPS — 장르·분위기·악기·보컬 퀵칩(스타일에 append)
const ALL_CHIPS = [
  '발라드', '팝', 'R&B', '힙합', '재즈', '포크', '록', 'EDM', '클래식', '소울',
  '인디', '보사노바', '트로트', 'K-pop', 'J-pop', '레게', '컨트리', '블루스',
  '잔잔한', '신나는', '감성적', '몽환적', '그리운', '밝은', '어두운', '우울한',
  '피아노', '어쿠스틱 기타', '일렉기타', '바이올린', '첼로', '드럼', '베이스',
  '신스', '오케스트라', '플루트', '트럼펫', '색소폰',
  '여성보컬', '남성보컬', '코러스', '팔세토', '보컬없음',
]
const pickChips = (): string[] => [...ALL_CHIPS].sort(() => Math.random() - 0.5).slice(0, 14)

// 음악 만들기 — 모바일 웹 파리티. 심플=설명 카드 / 고급=가사·스타일 카드 + 모델 드롭다운. POST /api/generate.
export default function CreateScreen() {
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<'simple' | 'advanced'>('advanced')  // 기본 = 고급(웹 파리티)
  const [style, setStyle] = useState('')
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [instrumental, setInstrumental] = useState(false)
  const [vocalGender, setVocalGender] = useState<'female' | 'male' | null>(null)
  const [model, setModel] = useState<MusicModelId>('music-2.0')
  const [chips, setChips] = useState<string[]>(pickChips)
  const [credits, setCredits] = useState<number | null>(null)
  const [lyricsBusy, setLyricsBusy] = useState(false)
  const [lyricsModalOpen, setLyricsModalOpen] = useState(false)
  const [lyricsPrompt, setLyricsPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/credits/me').then((c) => setCredits((c as { total?: number })?.total ?? null)).catch(() => {})
  }, [])

  // 키보드 실제 높이 추적(자동완성 바 포함) — CTA를 키보드에 정확히 붙이기 위해 컨테이너 하단을 그만큼 띄움
  const [kbHeight, setKbHeight] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKbHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  // 심플 +가사 → 고급 전환 후 가사 인풋 자동 포커스
  const lyricsRef = useRef<TextInput>(null)
  const [focusLyrics, setFocusLyrics] = useState(false)
  useEffect(() => {
    if (mode === 'advanced' && focusLyrics) {
      const t = setTimeout(() => { lyricsRef.current?.focus(); setFocusLyrics(false) }, 120)
      return () => clearTimeout(t)
    }
  }, [mode, focusLyrics])

  // AI 가사 모달 — 딤은 페이드, 시트만 슬라이드업(분리 애니메이션)
  const [modalMounted, setModalMounted] = useState(false)
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (lyricsModalOpen) {
      setModalMounted(true)
      Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start()
    } else if (modalMounted) {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => { if (finished) setModalMounted(false) })
    }
  }, [lyricsModalOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const simpleModel: MusicModelId = instrumental ? 'music-2.6' : 'music-2.0'
  const activeModel: MusicModelId = mode === 'simple' ? simpleModel : model
  const modelDef = MUSIC_MODELS.find((m) => m.id === activeModel)
  const cost = modelDef?.credits ?? 0
  const canSubmit = style.trim().length > 0 && !busy

  const addChip = (c: string) => setStyle((prev) => (prev ? `${prev}, ${c}` : c))
  const modelShort = (id: MusicModelId) => id.replace('music-', 'v')  // Music 2.0 → v2.0 (웹 표기)

  // 인스트루멘탈 토글 — v2.0은 인스트루멘탈 미지원이라 켜면 v2.6으로 자동전환(웹 동일)
  const toggleInstrumental = (v: boolean) => {
    setInstrumental(v)
    if (v && model === 'music-2.0') setModel('music-2.6')
  }

  const pickModel = () => {
    const opts = [...MUSIC_MODELS.map((m) => `${modelShort(m.id)} · ${m.desc}`), '취소']
    ActionSheetIOS.showActionSheetWithOptions(
      { options: opts, cancelButtonIndex: opts.length - 1, title: '모델 선택' },
      (i) => {
        if (i >= MUSIC_MODELS.length) return
        const id = MUSIC_MODELS[i].id
        if (id === 'music-2.0' && instrumental) setInstrumental(false)  // v2.0 선택 시 인스트 해제
        setModel(id)
      },
    )
  }

  // AI 가사 — 모달에서 프롬프트 입력 → /api/lyrics(크레딧無) → 가사·제목 적용
  const runLyrics = async (p: string) => {
    if (!p.trim() || lyricsBusy) return
    setLyricsBusy(true); setError(null)
    try {
      const r = await api.post('/api/lyrics', { prompt: p.trim() }) as { lyrics?: string; songTitle?: string }
      if (r.lyrics) {
        setLyrics(r.lyrics); setInstrumental(false)
        if (r.songTitle && !title.trim()) setTitle(r.songTitle)
        setLyricsModalOpen(false)
      }
    } catch (e) {
      const err = e as { error?: string; status?: number }
      setError(err.status === 429 ? '잠시 후 다시 시도해 주세요' : err.error ?? '가사 생성에 실패했어요')
    } finally { setLyricsBusy(false) }
  }

  const buildPrompt = () => {
    const vocalTag = vocalGender === 'female' ? 'female vocals' : vocalGender === 'male' ? 'male vocals' : null
    return [style.trim(), vocalTag].filter(Boolean).join(', ')
  }

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    try {
      if (mode === 'simple') {
        await generateSong({ prompt: style.trim(), instrumental, model: simpleModel, autoLyrics: !instrumental })
      } else {
        await generateSong({
          prompt: buildPrompt(),
          title: title.trim() || undefined,
          customLyrics: instrumental ? undefined : (lyrics.trim() || undefined),
          instrumental,
          autoLyrics: !instrumental && lyrics.trim().length === 0,
          model,
        })
      }
      router.replace('/')
    } catch (e) {
      const err = e as { error?: string; status?: number }
      setError(err.error ?? (err.status === 401 ? '로그인이 필요해요' : '생성에 실패했어요'))
      setBusy(false)
    }
  }

  // 카드 헤더의 인스트루멘탈 토글 (심플 설명 / 고급 가사 공통)
  const instToggle = (
    <View style={styles.instRow}>
      <Text style={[styles.instLabel, instrumental && styles.instLabelOn]}>인스트루멘탈</Text>
      <Switch
        value={instrumental}
        onValueChange={toggleInstrumental}
        trackColor={{ true: mono.color.accent, false: mono.color.fillStrong }}
        thumbColor="#fff"
      />
    </View>
  )

  const chipRail = (
    <View style={styles.railRow}>
      <Pressable onPress={() => setChips(pickChips())} style={styles.railBtn} hitSlop={6}><Icon name="refresh" size={16} color={mono.color.text} /></Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railChips} keyboardShouldPersistTaps="handled">
        {chips.map((c) => (
          <Pressable key={c} onPress={() => addChip(c)} style={styles.chip} hitSlop={4}><Text style={styles.chipText}>{c}</Text></Pressable>
        ))}
      </ScrollView>
    </View>
  )

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: 8 }]}>
        <View style={styles.handleRow}><View style={styles.handle} /></View>

        {/* 컨트롤 행: 크레딧 · 심플/고급 · 모델(고급) */}
        <View style={styles.controls}>
          <View style={styles.creditPill}>
            <Icon name="sparkle" size={13} color={mono.color.accentLight} />
            <Text style={styles.creditText}>{credits ?? '–'}</Text>
          </View>
          <View style={styles.modeToggle}>
            {(['simple', 'advanced'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeBtn, mode === m && styles.modeBtnOn]}>
                <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>{m === 'simple' ? '심플' : '고급'}</Text>
              </Pressable>
            ))}
          </View>
          {mode === 'advanced' ? (
            <Pressable onPress={pickModel} style={styles.modelPill} hitSlop={6}>
              <Text style={styles.modelPillText} numberOfLines={1}>{modelShort(model)}</Text>
              <Icon name="chevron.down" size={14} color={mono.color.textSecondary} />
            </Pressable>
          ) : <View style={styles.modelPillGhost} />}
        </View>

        <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {mode === 'simple' ? (
            /* 심플 = 설명 카드 하나 */
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>설명</Text>
                {instToggle}
              </View>
              <TextInput
                style={styles.cardInput}
                placeholder="만들고 싶은 노래를 자유롭게 적어보세요.&#10;제목부터 가사, 음악까지 한 번에 완성됩니다."
                placeholderTextColor={mono.color.textTertiary}
                value={style}
                onChangeText={setStyle}
                multiline
              />
              {!instrumental ? (
                <Pressable onPress={() => { setMode('advanced'); setFocusLyrics(true) }} style={styles.addBtn} hitSlop={6}>
                  <Icon name="plus" size={16} color={mono.color.text} /><Text style={styles.addBtnText}>가사</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            /* 고급 = 가사 카드 + 스타일 카드 + 옵션 */
            <>
              <View style={[styles.card, instrumental && styles.cardBar]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, instrumental && styles.cardTitleOn]}>가사</Text>
                  {instToggle}
                </View>
                {!instrumental ? (
                  <>
                    <TextInput
                      ref={lyricsRef}
                      style={[styles.cardInput, styles.lyricsInput]}
                      placeholder={'직접 가사를 입력하세요 (최소 10자 이상)\n비워두면 자동으로 인스트루멘탈로 생성돼요\n\n[Verse] [Chorus] [Bridge] 태그로 구조를 지정할 수 있어요'}
                      placeholderTextColor={mono.color.textTertiary}
                      value={lyrics}
                      onChangeText={setLyrics}
                      multiline
                    />
                    <View style={styles.cardFoot}>
                      <Pressable onPress={() => { setLyricsPrompt(style); setLyricsModalOpen(true) }} style={styles.aiBtn} hitSlop={6}>
                        <Icon name="ai.lyrics" size={15} color={mono.color.text} />
                        <Text style={styles.aiBtnText}>AI 가사</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>스타일</Text>
                <TextInput
                  style={styles.cardInput}
                  placeholder="장르, 분위기, 템포, 악기, 보컬 타입 등을 자유롭게 묘사하세요"
                  placeholderTextColor={mono.color.textTertiary}
                  value={style}
                  onChangeText={setStyle}
                  multiline
                />
                {chipRail}
              </View>

              <View style={[styles.card, styles.optCard]}>
                <Text style={styles.cardTitle}>보컬 성별</Text>
                <View style={styles.genderRow}>
                  {(['female', 'male'] as const).map((v) => {
                    const on = vocalGender === v
                    return (
                      <Pressable key={v} onPress={() => setVocalGender(on ? null : v)} style={[styles.gender, on && styles.genderOn]}>
                        <Text style={[styles.genderText, on && styles.genderTextOn]}>{v === 'female' ? '여성' : '남성'}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              <View style={styles.titleWrap}>
                <Icon name="music.file" size={18} color={mono.color.textTertiary} />
                <TextInput
                  style={styles.titleInput}
                  placeholder="곡 제목 (선택)"
                  placeholderTextColor={mono.color.textTertiary}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: kbHeight > 0 ? 8 : insets.bottom + 8 }]}>
          <Pressable onPress={canSubmit ? submit : undefined} style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaOff, pressed && canSubmit && styles.ctaPressed]}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <View style={styles.ctaInner}>
                <Text style={styles.ctaText}>음악 만들기</Text>
                <Icon name="sparkle" size={15} color="#fff" />
                <Text style={styles.ctaText}>{cost}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* AI 가사 생성 모달 — 딤 페이드 + 시트 슬라이드업(분리) */}
      <Modal visible={modalMounted} transparent animationType="none" onRequestClose={() => setLyricsModalOpen(false)}>
        <View style={styles.mRoot}>
          <Animated.View style={[styles.mDim, { opacity: anim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setLyricsModalOpen(false)} />
          </Animated.View>
          <Animated.View style={[styles.mSheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] }]}>
            <View style={styles.mHead}>
              <View style={styles.mTitleRow}>
                <Icon name="ai.lyrics" size={20} color={mono.color.text} />
                <Text style={styles.mTitle}>AI 가사</Text>
              </View>
              <Pressable onPress={() => setLyricsModalOpen(false)} hitSlop={10}><Icon name="close" size={22} color={mono.color.text} /></Pressable>
            </View>
            <TextInput
              style={styles.mInput}
              placeholder={'어떤 노래를 만들까요? 자유롭게 적어주세요\n예) 비 오는 날 헤어진 연인을 그리워하는 잔잔한 발라드'}
              placeholderTextColor={mono.color.textTertiary}
              value={lyricsPrompt}
              onChangeText={setLyricsPrompt}
              multiline
            />
            <Text style={styles.mHint}>입력한 내용을 바탕으로 멋진 가사를 만들어드려요. 크레딧은 소모되지 않아요.</Text>
            <Pressable onPress={() => runLyrics(lyricsPrompt)} disabled={lyricsBusy || !lyricsPrompt.trim()} style={[styles.cta, !lyricsPrompt.trim() && styles.ctaOff]}>
              {lyricsBusy ? <ActivityIndicator color="#fff" /> : (
                <View style={styles.ctaInner}>
                  <Icon name="ai.lyrics" size={16} color="#fff" />
                  <Text style={styles.ctaText}>가사 만들기</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 16 },
  handleRow: { alignItems: 'center', paddingTop: 4, paddingBottom: 38 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: mono.color.fillStrong },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  creditText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  modeToggle: { flexDirection: 'row', backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, padding: 3 },
  modeBtn: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: mono.radius.pill },
  modeBtnOn: { backgroundColor: '#fff' },
  modeText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '700' },
  modeTextOn: { color: '#111' },
  modelPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 12, paddingVertical: 9, maxWidth: 100 },
  modelPillText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  modelPillGhost: { minWidth: 68 },

  card: { backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: mono.color.borderSoft },
  cardBar: { paddingVertical: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: mono.color.text, fontSize: 17, fontWeight: '700' },
  cardTitleOn: { color: mono.color.accentLight },
  cardInput: { color: mono.color.text, fontSize: mono.font.body, paddingTop: 12, paddingBottom: 4, minHeight: 88, textAlignVertical: 'top', lineHeight: 24 },
  lyricsInput: { minHeight: 132 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  instLabel: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  instLabelOn: { color: mono.color.accentLight },

  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  addBtnText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  aiBtnOff: { opacity: 0.45 },
  aiBtnText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },

  railRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  railBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: mono.color.fill, alignItems: 'center', justifyContent: 'center' },
  railBtnText: { fontSize: 13 },
  railChips: { gap: 8, paddingRight: 8 },
  chip: { backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  chipText: { color: mono.color.text, fontSize: mono.font.small },

  optCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  genderRow: { flexDirection: 'row', gap: 8 },
  gender: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: mono.radius.pill, backgroundColor: mono.color.fill },
  genderOn: { backgroundColor: '#fff' },
  genderText: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  genderTextOn: { color: '#111' },

  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: mono.color.surface, borderRadius: mono.radius.lg, borderWidth: 1, borderColor: mono.color.borderSoft, paddingHorizontal: 16, marginBottom: 4 },
  titleInput: { flex: 1, color: mono.color.text, fontSize: mono.font.body, paddingVertical: 16 },

  error: { color: mono.color.danger, fontSize: mono.font.small, marginTop: 12, textAlign: 'center' },
  footer: { paddingTop: 8 },
  cta: { borderRadius: mono.radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: mono.color.accent },
  ctaOff: { opacity: 0.45 },
  ctaPressed: { opacity: 0.85 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ctaText: { color: '#fff', fontSize: mono.font.body, fontWeight: '700' },

  // AI 가사 모달 (딤 페이드 + 시트 슬라이드)
  mRoot: { flex: 1, justifyContent: 'flex-end' },
  mDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: mono.color.overlayStrong },
  mSheet: { backgroundColor: mono.color.surface, borderTopLeftRadius: mono.radius.xl, borderTopRightRadius: mono.radius.xl, padding: 20, gap: 12 },
  mHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mTitle: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  mHint: { color: mono.color.textSecondary, fontSize: mono.font.small, lineHeight: 20 },
  mInput: { backgroundColor: mono.color.bg, borderRadius: mono.radius.md, borderWidth: 1.5, borderColor: mono.color.accent, color: mono.color.text, fontSize: mono.font.body, padding: 16, minHeight: 240, textAlignVertical: 'top', lineHeight: 24 },
})
