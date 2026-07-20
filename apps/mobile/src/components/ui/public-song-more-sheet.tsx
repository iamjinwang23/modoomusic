import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Icon, type IconName } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

function Row({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  const c = color ?? mono.color.text
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Icon name={icon} size={20} color={c} />
      <Text style={[styles.label, { color: c }]}>{label}</Text>
    </Pressable>
  )
}

// 공개곡 더보기 — 남의 공개곡에서 할 수 있는 경량 액션(컬렉션 담기·공유·신고). 웹엔 없는 앱 확장.
export function PublicSongMoreSheet({ open, onClose, isOwner, collected, onCollect, onShare, onReport, onBlock }: {
  open: boolean
  onClose: () => void
  isOwner: boolean
  collected: boolean
  onCollect: () => void
  onShare: () => void
  onReport: () => void
  onBlock: () => void
}) {
  // 닫고 실행 — 시트 닫힘(200ms)+언마운트 후 실행(iOS 모달 중첩 무시 회피)
  const run = (fn: () => void) => () => { onClose(); setTimeout(fn, 300) }
  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.list}>
        <Row icon="collection" label="컬렉션" onPress={run(onCollect)} color={collected ? mono.color.accentLight : mono.color.text} />
        <Row icon="square.and.arrow.up" label="공유" onPress={run(onShare)} />
        {!isOwner ? (
          <>
            <View style={styles.divider} />
            <Row icon="flag" label="신고" onPress={run(onReport)} color={mono.color.danger} />
            <Row icon="forbid" label="차단" onPress={run(onBlock)} color={mono.color.danger} />
          </>
        ) : null}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20 },
  list: { paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderRadius: mono.radius.md, paddingHorizontal: 4 },
  rowPressed: { backgroundColor: mono.color.fill },
  label: { fontSize: mono.font.body, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: mono.color.borderSoft, marginVertical: 4 },
})
