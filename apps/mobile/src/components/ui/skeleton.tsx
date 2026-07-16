import { StyleSheet, useWindowDimensions, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native'
import { SkeletonShimmer } from '@/components/ui/skeleton-shimmer'
import { mono } from '@/theme/mono'

// 심플 스켈레톤 — 회색 박스 하나 + shimmer. 페이지 UI를 대략 흉내낸 뼈대용 최소 단위.
export function SkeletonBox({ w, h, radius = mono.radius.sm, style }: { w?: DimensionValue; h?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, { width: w, height: h, borderRadius: radius }, style]}>
      <SkeletonShimmer />
    </View>
  )
}

// 곡 리스트 행 스켈레톤 — 실제 SongRow와 동일 구조(커버 54×72 + 제목·서브 + 통계 3개).
export function SkeletonSongRow() {
  return (
    <View style={styles.row}>
      <SkeletonBox w={54} h={72} radius={mono.radius.sm} />
      <View style={styles.rowBody}>
        <SkeletonBox w="62%" h={15} radius={5} />
        <SkeletonBox w="38%" h={12} radius={5} style={{ marginTop: 8 }} />
        <View style={styles.rowStats}>
          <SkeletonBox w={34} h={12} radius={5} />
          <SkeletonBox w={34} h={12} radius={5} />
          <SkeletonBox w={34} h={12} radius={5} />
        </View>
      </View>
    </View>
  )
}

// 곡 리스트 스켈레톤 — 상단 2~3개 덩어리만(화면 꽉 채우지 않음, 심플).
export function SkeletonSongList({ count = 3, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => <SkeletonSongRow key={i} />)}
    </View>
  )
}

// 커뮤니티 게시글 스켈레톤 — 아바타+이름/시간, 본문 2줄. 커뮤니티 상세 피드 로딩용. 상단 2~3개.
export function SkeletonPost() {
  return (
    <View style={styles.post}>
      <View style={styles.postHead}>
        <SkeletonBox w={36} h={36} radius={18} />
        <View style={{ gap: 6 }}>
          <SkeletonBox w={90} h={12} radius={5} />
          <SkeletonBox w={54} h={10} radius={5} />
        </View>
      </View>
      <SkeletonBox w="92%" h={13} radius={5} style={{ marginTop: 12 }} />
      <SkeletonBox w="70%" h={13} radius={5} style={{ marginTop: 8 }} />
    </View>
  )
}

export function SkeletonPostList({ count = 3, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => <SkeletonPost key={i} />)}
    </View>
  )
}

// 커뮤니티 메인(허브) 스켈레톤 — 내커뮤니티 캐러셀(원형) + 섹션 제목 + 카드 격자. 실제 허브 형식.
export function SkeletonCommunityHub({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.hub, style]}>
      {/* 내 커뮤니티 — 가로 원형 스토리 */}
      <SkeletonBox w={72} h={16} radius={5} />
      <View style={styles.hubStories}>
        {Array.from({ length: 4 }).map((_, i) => <SkeletonBox key={i} w={56} h={56} radius={28} />)}
      </View>
      {/* 인기 글 — 풀폭 카드 하나 */}
      <SkeletonBox w={72} h={16} radius={5} style={{ marginTop: 24 }} />
      <SkeletonBox w="100%" h={120} radius={mono.radius.md} style={{ marginTop: 12 }} />
      {/* 커뮤니티 카드 2열 한 줄 */}
      <SkeletonBox w={96} h={16} radius={5} style={{ marginTop: 24 }} />
      <View style={styles.hubCards}>
        <SkeletonBox w="48%" h={110} radius={mono.radius.md} />
        <SkeletonBox w="48%" h={110} radius={mono.radius.md} />
      </View>
    </View>
  )
}

// 프로필 그리드 스켈레톤 — 실제 ProfileGrid와 동일(3열 1px 간격, 카드 3:2 세로). 상단 한 줄(3개)만.
export function SkeletonProfileGrid({ count = 3, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions()
  const itemW = (width - 2) / 3
  const itemH = itemW * 1.5
  return (
    <View style={[styles.grid, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBox key={i} w={itemW} h={itemH} radius={0} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { backgroundColor: mono.color.surface2, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBody: { flex: 1, minWidth: 0 },
  rowStats: { flexDirection: 'row', gap: 12, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  // 커뮤니티 게시글
  post: { paddingVertical: 14 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // 커뮤니티 허브
  hub: { paddingHorizontal: 20, marginTop: 8 },
  hubStories: { flexDirection: 'row', gap: 14, marginTop: 12 },
  hubCards: { flexDirection: 'row', gap: 12, marginTop: 12 },
})
