import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import type { PublicSong } from '@mono/shared'
import { Icon } from '@/components/ui/icon'
import { mono } from '@/theme/mono'

// 공개곡 행 — 탐색·크리에이터 프로필 공용. 커버/제목/크리에이터/좋아요, 탭→재생.
// onCreatorPress 주면 크리에이터 이름이 별도 탭 타깃(프로필 이동).
export function PublicSongRow({ song, onPress, onCreatorPress, onMore, showCreator = true }: {
  song: PublicSong
  onPress: () => void
  onCreatorPress?: () => void
  onMore?: () => void
  showCreator?: boolean
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.cover}>
        {song.coverImage ? <Image source={{ uri: song.coverImage }} style={styles.coverImg} contentFit="cover" /> : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{song.title ?? '제목 없음'}</Text>
        {showCreator ? (
          <Text
            style={styles.creator}
            numberOfLines={1}
            onPress={onCreatorPress}
            suppressHighlighting
          >
            {song.displayName || song.username}
          </Text>
        ) : null}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Icon name="play.fill" size={13} color={mono.color.textTertiary} />
            <Text style={styles.statText}>{song.playCount}</Text>
          </View>
          <View style={styles.stat}>
            <Icon name="heart" size={13} color={mono.color.textTertiary} />
            <Text style={styles.statText}>{song.likeCount}</Text>
          </View>
          <View style={styles.stat}>
            <Icon name="bubble.left" size={13} color={mono.color.textTertiary} />
            <Text style={styles.statText}>{song.commentCount}</Text>
          </View>
        </View>
      </View>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={12} style={styles.more}><Icon name="ellipsis" size={18} color={mono.color.textSecondary} /></Pressable>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  pressed: { opacity: 0.7 },
  // 커버 = 세로(포트레이트) — 브랜드 정체성(웹 파리티)
  cover: { width: 54, aspectRatio: 3 / 4, borderRadius: mono.radius.sm, overflow: 'hidden', backgroundColor: mono.color.surface2 },
  coverImg: { width: '100%', height: '100%' },
  body: { flex: 1, gap: 4 },
  title: { color: mono.color.text, fontSize: mono.font.body, fontWeight: '600' },
  // alignSelf flex-start — 이름 글자 폭만 탭 영역(빈 공간은 행 재생으로 떨어짐)
  creator: { color: mono.color.textSecondary, fontSize: mono.font.small, alignSelf: 'flex-start', maxWidth: '100%' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 1 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { color: mono.color.textTertiary, fontSize: mono.font.small },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
})
