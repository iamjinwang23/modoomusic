import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import { Icon } from '@/components/ui/icon'
import { GeneratingDots } from '@/components/ui/generating-dots'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { api } from '@/lib/api'
import { generateSong, MUSIC_MODELS, type MusicModelId } from '@/lib/generate'
import { pickRefAudio, refAudioAvailable } from '@/lib/ref-audio'
import { hapticLight } from '@/lib/haptics'
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
  const [model, setModel] = useState<MusicModelId>('music-3.0')
  const [chips, setChips] = useState<string[]>(pickChips)
  const [credits, setCredits] = useState<number | null>(null)
  const [lyricsGenerating, setLyricsGenerating] = useState(false)
  const [lyricsModalOpen, setLyricsModalOpen] = useState(false)
  const [lyricsFullOpen, setLyricsFullOpen] = useState(false)  // 가사 전체화면 편집 시트
  const [modelSheetOpen, setModelSheetOpen] = useState(false)  // 모델 선택 바텀시트
  const [refAudio, setRefAudio] = useState<{ name: string; base64: string } | null>(null)  // v2.6 스타일 참조 음원
  const [refBusy, setRefBusy] = useState(false)
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

  const simpleModel: MusicModelId = instrumental ? 'music-2.6' : 'music-2.0'
  const activeModel: MusicModelId = mode === 'simple' ? simpleModel : model
  const modelDef = MUSIC_MODELS.find((m) => m.id === activeModel)
  const cost = modelDef?.credits ?? 0
  // 가사 생성 중엔 음악 생성 차단 — 아직 안 채워진 가사로 곡이 만들어지는 레이스 방지
  const canSubmit = style.trim().length > 0 && !busy && !lyricsGenerating

  const addChip = (c: string) => setStyle((prev) => (prev ? `${prev}, ${c}` : c))
  const modelShort = (id: MusicModelId) => id.replace('music-', 'v')  // Music 2.0 → v2.0 (웹 표기)

  // 인스트루멘탈 토글 — v2.0은 인스트루멘탈 미지원이라 켜면 v2.6으로 자동전환(웹 동일)
  const toggleInstrumental = (v: boolean) => {
    setInstrumental(v)
    if (v && model === 'music-2.0') setModel('music-2.6')
  }

  const pickModel = () => setModelSheetOpen(true)
  const selectModel = (id: MusicModelId) => {
    hapticLight()
    if (id === 'music-2.0' && instrumental) setInstrumental(false)  // v2.0 선택 시 인스트 해제
    if (id !== 'music-2.6') setRefAudio(null)  // 참조는 v2.6 전용
    setModel(id)
    setModelSheetOpen(false)
  }

  // v2.6 스타일 참조 음원 선택 — 크기 초과(요청 바디 한도)는 거부(짧은 클립 유도)
  const chooseRefAudio = async () => {
    if (refBusy) return
    setRefBusy(true); setError(null)
    try {
      const r = await pickRefAudio()
      if (r.ok && r.base64) setRefAudio({ name: r.name ?? '참조 음원', base64: r.base64 })
      else if (r.error) setError(r.error)
    } finally { setRefBusy(false) }
  }

  // AI 가사 — 모달에서 프롬프트 입력 → /api/lyrics(크레딧無) → 가사·제목 적용
  const runLyrics = async (p: string) => {
    if (!p.trim() || lyricsGenerating) return
    // 즉시 모달 닫고 고급 모드로 — 가사 카드에 "생성 중" 인터랙션 노출(비차단)
    setLyricsModalOpen(false)
    setMode('advanced'); setInstrumental(false)
    setLyricsGenerating(true); setError(null)
    try {
      const r = await api.post('/api/lyrics', { prompt: p.trim() }) as { lyrics?: string; songTitle?: string }
      if (r.lyrics) {
        setLyrics(r.lyrics)
        if (r.songTitle && !title.trim()) setTitle(r.songTitle)
      }
    } catch (e) {
      const err = e as { error?: string; status?: number }
      setError(err.status === 429 ? '잠시 후 다시 시도해 주세요' : err.error ?? '가사 생성에 실패했어요')
    } finally { setLyricsGenerating(false) }
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
          // v2.6 + 참조 음원 = cover 모드
          audioBase64: model === 'music-2.6' && refAudio ? refAudio.base64 : undefined,
        })
      }
      router.replace('/library')
    } catch (e) {
      const err = e as { error?: string; status?: number; code?: string }
      setBusy(false)
      // 크레딧 부족(429=일일 한도/부족) → 충전 화면으로 유도. api-client는 code를 안 실어서 status로도 판정.
      const isCreditShortage = err.code === 'DAILY_LIMIT' || (err.status === 429 && !!err.error?.includes('크레딧'))
      if (isCreditShortage) {
        Alert.alert('크레딧이 부족해요', err.error ?? '크레딧을 충전하면 계속 만들 수 있어요.', [
          { text: '닫기', style: 'cancel' },
          { text: '충전하기', onPress: () => router.push('/credit-purchase') },
        ])
        return
      }
      setError(err.error ?? (err.status === 401 ? '로그인이 필요해요' : '생성에 실패했어요'))
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
    <View style={styles.flex}>
      <View style={[styles.container, { paddingTop: 8 }]}>
        <View style={styles.handleRow}><View style={styles.handle} /></View>

        {/* 컨트롤 행: 크레딧 · 심플/고급 · 모델(고급) */}
        <View style={styles.controls}>
          <Pressable style={styles.creditPill} onPress={() => router.push('/credit-purchase')} hitSlop={6}>
            <Icon name="sparkle" size={13} color={mono.color.text} />
            <Text style={styles.creditText}>{credits ?? '–'}</Text>
          </Pressable>
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

        <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>

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
                  lyricsGenerating ? (
                    <View style={styles.lyricsGenBox}>
                      <GeneratingDots label="가사를 만들고 있어요…" />
                    </View>
                  ) : (
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
                      {model === 'music-2.6' && refAudioAvailable() ? (
                        <Pressable onPress={chooseRefAudio} style={[styles.aiBtn, refAudio && styles.aiBtnOn]} hitSlop={6}>
                          {refBusy ? <ActivityIndicator size="small" color={mono.color.text} /> : <Icon name="music.note" size={15} color={refAudio ? mono.color.accentLight : mono.color.text} />}
                          <Text style={[styles.aiBtnText, refAudio && styles.aiBtnTextOn]} numberOfLines={1}>{refAudio ? '참조곡 ✓' : '스타일 참조'}</Text>
                        </Pressable>
                      ) : null}
                      <View style={styles.flex} />
                      <Pressable onPress={() => setLyricsFullOpen(true)} style={styles.expandBtn} hitSlop={8}>
                        <Icon name="fullscreen" size={17} color={mono.color.text} />
                      </Pressable>
                    </View>
                  </>
                  )
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

        <View style={[styles.footer, { paddingBottom: kbHeight > 0 ? kbHeight + 8 : insets.bottom + 8 }]}>
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

      {/* AI 가사 생성 — 전체화면 글쓰기(compose) 스타일: 헤더 액션 + 테두리 없는 직접 입력 */}
      <Modal visible={lyricsModalOpen} animationType="slide" onRequestClose={() => setLyricsModalOpen(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.mScreen, { paddingTop: insets.top + 8 }]}>
            <View style={styles.mHead}>
              <Pressable onPress={() => setLyricsModalOpen(false)} hitSlop={12}><Text style={styles.mClose}>✕</Text></Pressable>
              <Text style={styles.mTitle}>AI 가사</Text>
              <Pressable onPress={() => runLyrics(lyricsPrompt)} disabled={!lyricsPrompt.trim()} hitSlop={12}>
                <Text style={[styles.mAction, !lyricsPrompt.trim() && styles.mActionOff]}>만들기</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.mInput}
              placeholder={'어떤 노래를 만들까요? 자유롭게 적어주세요\n예) 비 오는 날 헤어진 연인을 그리워하는 잔잔한 발라드'}
              placeholderTextColor={mono.color.textTertiary}
              value={lyricsPrompt}
              onChangeText={setLyricsPrompt}
              multiline
              autoFocus
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 가사 전체화면 편집 — 축소 버튼(우상단)으로 닫으면 그대로 반영 */}
      <Modal visible={lyricsFullOpen} animationType="slide" onRequestClose={() => setLyricsFullOpen(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.mScreen, { paddingTop: insets.top + 8 }]}>
            <View style={styles.mHead}>
              <Pressable onPress={() => setLyricsFullOpen(false)} hitSlop={12}><Text style={styles.mClose}>✕</Text></Pressable>
              <Text style={styles.mTitle}>가사</Text>
              <View style={styles.mHeadSlot} />
            </View>
            <TextInput
              style={styles.mInput}
              placeholder={'직접 가사를 입력하세요 (최소 10자 이상)\n비워두면 자동으로 인스트루멘탈로 생성돼요\n\n[Verse] [Chorus] [Bridge] 태그로 구조를 지정할 수 있어요'}
              placeholderTextColor={mono.color.textTertiary}
              value={lyrics}
              onChangeText={setLyrics}
              multiline
              autoFocus
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 모델 선택 — 하단 바텀시트(웹 모델 드롭다운 파리티) */}
      <BottomSheet open={modelSheetOpen} onClose={() => setModelSheetOpen(false)} sheetStyle={styles.modelSheet}>
        <Text style={styles.modelSheetTitle}>모델 선택</Text>
        {MUSIC_MODELS.map((m) => {
          const on = model === m.id
          return (
            <Pressable key={m.id} onPress={() => selectModel(m.id)} style={({ pressed }) => [styles.modelRow, pressed && styles.modelRowPressed]}>
              <View style={[styles.modelCheck, on && styles.modelCheckOn]}>
                {on ? (
                  <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M20 6L9 17l-5-5" />
                  </Svg>
                ) : null}
              </View>
              <View style={styles.flex}>
                <View style={styles.modelRowHead}>
                  <Text style={styles.modelName}>{m.label}</Text>
                  {m.id === 'music-2.6' ? <Text style={styles.modelBadge}>참조</Text> : null}
                </View>
                <Text style={styles.modelDesc}>{m.desc}</Text>
              </View>
              <View style={styles.modelCredit}>
                <Icon name="sparkle" size={12} color={mono.color.text} />
                <Text style={styles.modelCreditText}>{m.credits}</Text>
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
  // 가사 입력 — 최대 5줄(24*5=120 + 상하패딩)까지 늘어나고 이후 내부 스크롤
  lyricsInput: { minHeight: 132, maxHeight: 136 },
  expandBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: mono.color.fill, alignItems: 'center', justifyContent: 'center' },
  lyricsGenBox: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  instLabel: { color: mono.color.textSecondary, fontSize: mono.font.small, fontWeight: '600' },
  instLabelOn: { color: mono.color.accentLight },

  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  addBtnText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: mono.color.fill, borderRadius: mono.radius.pill, paddingHorizontal: 16, paddingVertical: 10 },
  aiBtnOff: { opacity: 0.45 },
  aiBtnOn: { backgroundColor: 'rgba(124,58,237,0.18)' },
  aiBtnText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '600' },
  aiBtnTextOn: { color: mono.color.accentLight },

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
  // AI 가사 — 전체화면 글쓰기 스타일(compose 파리티): 테두리 없는 직접 입력
  mScreen: { flex: 1, backgroundColor: mono.color.bg, paddingHorizontal: 20 },
  mHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  mClose: { color: mono.color.text, fontSize: 22, width: 28 },
  mTitle: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700' },
  mHeadSlot: { width: 28 },
  // 모델 선택 바텀시트
  modelSheet: { paddingHorizontal: 20 },
  modelSheetTitle: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '700', textAlign: 'center', marginTop: 14, marginBottom: 22 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderRadius: mono.radius.md },
  modelRowPressed: { backgroundColor: mono.color.fill },
  modelRowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelName: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  modelBadge: { color: mono.color.accentLight, fontSize: 10, fontWeight: '700', backgroundColor: 'rgba(124,58,237,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  modelDesc: { color: mono.color.textSecondary, fontSize: mono.font.small, marginTop: 3 },
  modelCredit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modelCreditText: { color: mono.color.text, fontSize: mono.font.small, fontWeight: '700' },
  modelCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: mono.color.fillStrong, alignItems: 'center', justifyContent: 'center' },
  modelCheckOn: { backgroundColor: mono.color.accent, borderColor: mono.color.accent },
  mAction: { color: mono.color.accentLight, fontSize: mono.font.body, fontWeight: '800' },
  mActionOff: { color: mono.color.textTertiary },
  mInput: { flex: 1, color: mono.color.text, fontSize: mono.font.body, lineHeight: 24, textAlignVertical: 'top', paddingTop: 8, paddingBottom: 12 },
})
