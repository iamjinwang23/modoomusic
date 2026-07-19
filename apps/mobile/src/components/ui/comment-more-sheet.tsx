import { Pressable, StyleSheet, Text } from 'react-native'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Icon, type IconName } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

function Row({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  const c = color ?? mono.color.text
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Icon name={icon} size={19} color={c} />
      <Text style={[styles.label, { color: c }]}>{label}</Text>
    </Pressable>
  )
}

// 댓글 더보기 바텀시트 — 웹 CommentItem 더보기 파리티(본인: 수정·삭제 / 타인: 신고. 매니저: 삭제).
export function CommentMoreSheet({ open, onClose, isOwner, canDelete, canReport, onEdit, onDelete, onReport, onBlock }: {
  open: boolean
  onClose: () => void
  isOwner: boolean
  canDelete: boolean
  canReport: boolean
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
  onBlock: () => void
}) {
  const run = (fn: () => void) => () => { onClose(); setTimeout(fn, 260) }
  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={styles.sheet}>
      {isOwner ? <Row icon="edit" label="수정" onPress={run(onEdit)} /> : null}
      {canDelete ? <Row icon="trash" label="삭제" onPress={run(onDelete)} color={mono.color.danger} /> : null}
      {canReport && !isOwner ? <Row icon="flag" label="신고" onPress={run(onReport)} color={mono.color.danger} /> : null}
      {!isOwner ? <Row icon="close" label="차단" onPress={run(onBlock)} color={mono.color.danger} /> : null}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 15, borderRadius: mono.radius.md },
  rowPressed: { backgroundColor: mono.color.fill },
  label: { fontSize: mono.font.body, fontWeight: '600' },
})
