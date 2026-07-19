import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, Alert, Platform } from 'react-native'
import { router } from 'expo-router'
import type { PublicSong } from '@mono/shared'
import { api } from './api'
import { blockUser } from './block'
import { shareSong, setSongPublished, downloadSong, deleteSong } from './song-actions'
import { isInAnyCollection } from './collection'
import { useSession } from './use-session'
import { useAuthGate } from './auth-gate'
import { toast } from './toast'
import { PublicSongMoreSheet } from '@/components/ui/public-song-more-sheet'
import { SongMoreSheet } from '@/components/ui/song-more-sheet'
import { SongEditModal } from '@/components/ui/song-edit-modal'
import { CollectionPickerModal } from '@/components/ui/collection-picker-modal'

const REPORT_REASONS = ['욕설·비속어', '음란물', '혐오·차별 표현', '도배', '광고·홍보성 콘텐츠', '개인정보 노출', '저작권 침해', '기타']

// 공개곡 더보기(⋮) 공용 훅 — 둘러보기·검색·태그 등 공개곡 목록에서 재사용.
// 내 곡이면 소유자 메뉴(SongMoreSheet: 공개토글·다운로드·영상·수정·삭제), 남의 곡이면 경량 메뉴(담기·공유·신고).
// onChanged: 소유자 액션(삭제·공개토글)으로 목록 갱신이 필요할 때 호출.
export function usePublicSongMore(onChanged?: () => void) {
  const { session } = useSession()
  const { requireAuth } = useAuthGate()
  const myId = session?.user?.id
  const [moreSong, setMoreSong] = useState<PublicSong | null>(null)
  const [collected, setCollected] = useState(false)
  const [pickerSong, setPickerSong] = useState<PublicSong | null>(null)
  const [editSong, setEditSong] = useState<PublicSong | null>(null)
  const ref = useRef<PublicSong | null>(null)

  const isOwner = !!myId && moreSong?.userId === myId

  useEffect(() => { if (moreSong) isInAnyCollection(moreSong.id).then(setCollected) }, [moreSong])

  const open = useCallback((song: PublicSong) => { ref.current = song; setMoreSong(song) }, [])

  const report = (song: PublicSong) => {
    const run = async (reason: string) => {
      try { await api.post(`/api/songs/${song.id}/report`, { reason }); toast.success('신고가 접수되었어요') }
      catch { toast.error('처리에 실패했어요') }
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...REPORT_REASONS, '취소'], cancelButtonIndex: REPORT_REASONS.length, title: '신고 사유' }, (i) => { if (i < REPORT_REASONS.length) run(REPORT_REASONS[i]) })
    } else {
      Alert.alert('신고 사유', undefined, [...REPORT_REASONS.map((r) => ({ text: r, onPress: () => run(r) })), { text: '취소', style: 'cancel' as const }])
    }
  }

  const block = (song: PublicSong) => {
    Alert.alert('이 사용자를 차단할까요?', `${song.displayName || '이 사용자'}님의 콘텐츠가 더 이상 보이지 않아요.`, [
      { text: '아니요', style: 'cancel' },
      { text: '차단하기', style: 'destructive', onPress: async () => {
        try {
          await blockUser(song.userId)
          toast.success('차단했어요')
          onChanged?.()
          // 신고 함께 제안
          Alert.alert('신고도 하시겠어요?', '부적절한 콘텐츠라면 함께 신고해 주세요.', [
            { text: '건너뛰기', style: 'cancel' },
            { text: '신고하기', onPress: () => report(song) },
          ])
        } catch { toast.error('처리에 실패했어요') }
      } },
    ])
  }

  const confirmDelete = (song: PublicSong) => {
    Alert.alert('곡을 삭제할까요?', song.title?.trim() || '제목 없음', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { const ok = await deleteSong(song.id); toast[ok ? 'info' : 'error'](ok ? '곡이 삭제되었어요' : '삭제에 실패했어요'); onChanged?.() } },
    ])
  }

  const sheet = (
    <>
      {isOwner ? (
        <SongMoreSheet
          open={!!moreSong}
          onClose={() => setMoreSong(null)}
          isOwner
          published={!!ref.current?.published}
          collected={collected}
          onCollect={() => { const s = ref.current; if (s) setPickerSong(s) }}
          onPublishToggle={async () => { const s = ref.current; if (s) { const ok = await setSongPublished(s.id, !s.published); if (ok) toast[s.published ? 'info' : 'success'](s.published ? '공개가 취소되었어요' : '곡을 공개했어요'); else toast.error('처리에 실패했어요'); onChanged?.() } }}
          onDownload={async () => { const s = ref.current; if (s?.audioUrl) { const ok = await downloadSong(s.audioUrl, s.title); if (!ok) toast.error('다운로드에 실패했어요') } }}
          onVideoCover={() => { const s = ref.current; if (s) router.push(`/video-create?songId=${s.id}${s.coverImage ? `&cover=${encodeURIComponent(s.coverImage)}` : ''}`) }}
          onEdit={() => setEditSong(ref.current)}
          onDelete={() => { const s = ref.current; if (s) confirmDelete(s) }}
          onReport={() => {}}
        />
      ) : (
        <PublicSongMoreSheet
          open={!!moreSong}
          onClose={() => setMoreSong(null)}
          isOwner={false}
          collected={collected}
          onCollect={() => { if (ref.current && requireAuth()) setPickerSong(ref.current) }}
          onShare={() => { const s = ref.current; if (s) shareSong(s.id, s.title) }}
          onReport={() => { if (ref.current && requireAuth()) report(ref.current) }}
          onBlock={() => { if (ref.current && requireAuth()) block(ref.current) }}
        />
      )}
      <SongEditModal
        open={!!editSong}
        onClose={() => setEditSong(null)}
        song={editSong ? { id: editSong.id, title: editSong.title, lyrics: editSong.lyrics ?? null, publishComment: editSong.publishComment ?? null, coverImage: editSong.coverImage, coverHue: editSong.coverHue } : null}
        onSaved={() => onChanged?.()}
      />
      <CollectionPickerModal
        open={!!pickerSong}
        song={pickerSong}
        onClose={() => { const s = pickerSong; setPickerSong(null); if (s) isInAnyCollection(s.id).then(setCollected) }}
      />
    </>
  )

  return { open, sheet }
}
