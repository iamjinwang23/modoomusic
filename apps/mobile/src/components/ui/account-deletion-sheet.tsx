import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { mono } from '@/theme/mono'

// 웹 AccountDeletionModal 파리티 — 2단계(정책 안내 → 사유). 7일 grace·Option A 익명화.
type Stage = 'confirm' | 'reason'
type Reason = 'quality' | 'no_ideas' | 'switching' | 'privacy' | 'pause' | 'other'

const REASON_OPTIONS: { value: Reason; label: string }[] = [
  { value: 'quality', label: 'AI 음악 품질이 만족스럽지 못해요' },
  { value: 'no_ideas', label: '만들 곡 아이디어가 더 떠오르지 않아요' },
  { value: 'switching', label: '다른 서비스를 사용하기로 했어요' },
  { value: 'privacy', label: '개인정보·계정 관리 차원에서' },
  { value: 'pause', label: '너무 자주 들어오게 돼서 잠시 끊고 싶어요' },
  { value: 'other', label: '기타' },
]

export function AccountDeletionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('confirm')
  const [reason, setReason] = useState<Reason>('quality')
  const [reasonText, setReasonText] = useState('')
  const [busy, setBusy] = useState(false)

  // 열릴 때마다 초기화
  useEffect(() => { if (open) { setStage('confirm'); setReason('quality'); setReasonText(''); setBusy(false) } }, [open])

  const close = () => { if (!busy) onClose() }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.post('/api/account/delete', { reason_category: reason, reason_text: reasonText.trim() })
      await supabase.auth.signOut()
      onClose()
      router.replace('/')
      Alert.alert('탈퇴 처리됐어요', '7일 이내 같은 계정으로 다시 로그인하면 복원돼요.')
    } catch (e) {
      const code = (e as { error?: string })?.error
      Alert.alert(code === 'already_deleted' ? '이미 탈퇴 처리된 계정이에요' : '탈퇴 처리 중 문제가 발생했어요')
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={close}>
      <View style={styles.wrap}>
        {stage === 'confirm' ? (
          <>
            <Text style={styles.title}>정말 탈퇴하시겠어요?</Text>
            <Text style={styles.body}>
              탈퇴 후 <Text style={styles.strong}>7일 이내</Text>에 같은 계정으로 다시 로그인하면 자동으로 복원됩니다. 7일이 지나면 모든 데이터가 운영정책에 따라 처리되며 되돌릴 수 없어요.
            </Text>
            <View style={styles.note}>
              <Text style={styles.noteLine}>· 공개한 곡과 댓글은 <Text style={styles.noteStrong}>"(탈퇴한 회원)"</Text>으로 익명 처리되어 유지됩니다</Text>
              <Text style={styles.noteLine}>· 비공개 곡·좋아요·팔로우·알림은 영구 파기됩니다</Text>
              <Text style={styles.noteLine}>· 친구 초대로 받은 보너스 크레딧 통계는 익명으로 보존됩니다</Text>
            </View>
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={close}><Text style={styles.btnGhostText}>취소</Text></Pressable>
              <Pressable style={[styles.btn, styles.btnNeutral]} onPress={() => setStage('reason')}><Text style={styles.btnNeutralText}>계속</Text></Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>탈퇴 사유를 알려주세요</Text>
            <Text style={styles.sub}>여러분의 의견은 서비스 개선에 큰 도움이 됩니다. 익명으로 통계 집계만 됩니다.</Text>
            <ScrollView style={styles.reasonScroll} showsVerticalScrollIndicator={false}>
              {REASON_OPTIONS.map((opt) => {
                const on = reason === opt.value
                return (
                  <Pressable key={opt.value} style={[styles.reasonRow, on && styles.reasonRowOn]} onPress={() => setReason(opt.value)}>
                    <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
                    <Text style={styles.reasonLabel}>{opt.label}</Text>
                  </Pressable>
                )
              })}
              <TextInput
                value={reasonText}
                onChangeText={(t) => setReasonText(t.slice(0, 200))}
                placeholder="더 자세한 의견을 자유롭게 적어주세요 (선택)"
                placeholderTextColor={mono.color.textTertiary}
                multiline
                style={styles.textarea}
              />
              <Text style={styles.count}>{reasonText.length}/200</Text>
            </ScrollView>
            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.btnGhost, busy && styles.off]} onPress={() => !busy && setStage('confirm')}><Text style={styles.btnGhostText}>뒤로</Text></Pressable>
              <Pressable style={[styles.btn, styles.btnDanger, busy && styles.off]} onPress={submit}><Text style={styles.btnDangerText}>{busy ? '처리 중…' : '탈퇴하기'}</Text></Pressable>
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 4 },
  title: { color: mono.color.text, fontSize: mono.font.h2, fontWeight: '800', marginBottom: 10 },
  body: { color: mono.color.textSecondary, fontSize: mono.font.body, lineHeight: 22 },
  strong: { color: mono.color.text, fontWeight: '700' },
  sub: { color: mono.color.textSecondary, fontSize: mono.font.small, lineHeight: 20, marginBottom: 14 },
  note: { backgroundColor: mono.color.fill, borderRadius: mono.radius.md, borderWidth: 1, borderColor: mono.color.borderSoft, padding: 14, marginTop: 14, marginBottom: 20, gap: 6 },
  noteLine: { color: mono.color.textSecondary, fontSize: mono.font.small, lineHeight: 19 },
  noteStrong: { color: mono.color.text },
  reasonScroll: { maxHeight: 360 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderRadius: mono.radius.md, backgroundColor: mono.color.fill, borderWidth: 1, borderColor: 'transparent', marginBottom: 8 },
  reasonRowOn: { backgroundColor: mono.color.fillStrong, borderColor: mono.color.border },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: mono.color.textTertiary, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: mono.color.text },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: mono.color.text },
  reasonLabel: { color: mono.color.text, fontSize: mono.font.body, flex: 1 },
  textarea: { backgroundColor: mono.color.fill, borderRadius: mono.radius.md, borderWidth: 1, borderColor: mono.color.borderSoft, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, minHeight: 76, color: mono.color.text, fontSize: mono.font.body, textAlignVertical: 'top', marginTop: 4 },
  count: { color: mono.color.textTertiary, fontSize: mono.font.tiny, textAlign: 'right', marginTop: 6, marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, borderRadius: mono.radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: mono.color.fill },
  btnGhostText: { color: mono.color.textSecondary, fontSize: mono.font.body, fontWeight: '600' },
  btnNeutral: { backgroundColor: mono.color.fillStrong },
  btnNeutralText: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '700' },
  btnDanger: { backgroundColor: '#ef4444' },
  btnDangerText: { color: '#ffffff', fontSize: mono.font.body, fontWeight: '800' },
  off: { opacity: 0.5 },
})
