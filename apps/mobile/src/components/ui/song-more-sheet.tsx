import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Icon, type IconName } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

function Row({ icon, label, onPress, color, tint }: { icon: IconName; label: string; onPress: () => void; color?: string; tint?: string }) {
  const c = color ?? mono.color.text
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Icon name={icon} size={20} color={tint ?? c} />
      <Text style={[styles.label, { color: c }]}>{label}</Text>
    </Pressable>
  )
}

// 곡 더보기 바텀시트 — 웹 SongMoreMenu 패리티(컬렉션·공개/취소·다운로드·영상·수정·삭제·신고).
export function SongMoreSheet({ open, onClose, isOwner, published, collected, onCollect, onPublishToggle, onDownload, onVideoCover, onEdit, onDelete, onReport }: {
  open: boolean
  onClose: () => void
  isOwner: boolean
  published: boolean
  collected: boolean
  onCollect: () => void
  onPublishToggle: () => void
  onDownload: () => void
  onVideoCover: () => void
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
}) {
  // 닫고 실행 — 시트 닫힘 애니(200ms)+언마운트 후 실행. iOS는 모달 닫는 중 다른 모달 열면 무시됨.
  const run = (fn: () => void) => () => { onClose(); setTimeout(fn, 300) }
  return (
    <BottomSheet open={open} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.list}>
        <Row icon="collection" label="컬렉션" onPress={run(onCollect)} color={collected ? mono.color.accentLight : mono.color.text} />
        {!isOwner ? (
          <>
            <View style={styles.divider} />
            <Row icon="flag" label="신고" onPress={run(onReport)} color={mono.color.danger} />
          </>
        ) : (
          <>
            <View style={styles.divider} />
            <Row icon="compass" label={published ? '공개 취소' : '공개하기'} onPress={run(onPublishToggle)} />
            <Row icon="download" label="다운로드" onPress={run(onDownload)} />
            <Row icon="film" label="영상 만들기" onPress={run(onVideoCover)} />
            <View style={styles.divider} />
            <Row icon="edit" label="수정" onPress={run(onEdit)} />
            <Row icon="trash" label="삭제" onPress={run(onDelete)} color={mono.color.danger} />
          </>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 8 },
  list: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 15, borderRadius: mono.radius.md },
  rowPressed: { backgroundColor: mono.color.fill },
  label: { fontSize: mono.font.body, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: mono.color.borderSoft, marginVertical: 6, marginHorizontal: 6 },
})
