// 커뮤니티(그룹 피드형·밴드류) 상세 — 헤더·가입/탈퇴·글쓰기(멤버)·피드·좋아요·댓글·고정/삭제(관리)
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { ConfirmModal } from '@/components/ConfirmModal'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'

const GRAY_COVER = '#363A47'
const GRAY_AVATAR = '#3E4250'
const GRAY_AVATAR_TEXT = '#A8B0BC'
import { relativeTime } from '@/utils/relativeTime'
import { songService } from '@/services/song.service'
import { CommunityCommentItem } from '@/components/community/CommunityCommentItem'
import { CommunityPostReportModal } from '@/components/community/CommunityPostReportModal'
import { CommunityEditModal } from '@/components/community/CommunityEditModal'
import { CommunityPostEditModal } from '@/components/community/CommunityPostEditModal'
import { CommunityMembersModal } from '@/components/community/CommunityMembersModal'
import { ScrollToTopButton } from '@/components/community/ScrollToTopButton'
import { PostImageGallery } from '@/components/community/PostImageGallery'
import { PostEmbed } from '@/components/community/PostEmbed'
import { PollCard } from '@/components/community/PollCard'
import { SongEmbedCard } from '@/components/community/SongEmbedCard'
import { getMyReportedPostIds } from '@/services/report.service'
import type { Community, CommunityPost, CommunityMember, CommunityPostComment, Song } from '@/types/domain'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

function countComments(list: CommunityPostComment[]): number {
  return list.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)
}

const URL_RE = /(https?:\/\/[^\s]+)/gi
function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/i)
  return m ? m[0] : null
}
// 본문 내 URL을 클릭 가능한 링크로 변환
function linkify(text: string): React.ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//i.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-violet-300 hover:underline break-all">{part}</a>
      : part,
  )
}

const CONTENT_MAX = 500
// 노래 만들기와 동일 — 80% 도달 전 숨김, 80~99% 앰버, 100% 레드
function CharCount({ length, limit }: { length: number; limit: number }) {
  if (length < limit * 0.8) return null
  return <span className={`text-xs tabular-nums shrink-0 ${length >= limit ? 'text-red-400' : 'text-amber-300'}`}>{length.toLocaleString()} / {limit.toLocaleString()}자</span>
}

function Avatar({ name, hue, url, size = 32 }: { name: string | null; hue: number | null; url: string | null; size?: number }) {
  const c = profileColor(hue ?? 0)
  if (url) return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  return <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: size, height: size, background: c.bg, color: c.text, fontSize: size * 0.42 }}>{(name ?? '?').slice(0, 1).toUpperCase()}</div>
}

function SongCover({ coverImage, coverHue, size = 40 }: { coverImage?: string | null; coverHue?: number | null; size?: number }) {
  const c = profileColor(coverHue ?? 0)
  return (
    <div className="rounded-md overflow-hidden shrink-0" style={{ width: size, height: size, background: `linear-gradient(135deg, ${c.bg}, #161922)` }}>
      {coverImage && <img src={coverImage} alt="" className="w-full h-full object-cover" />}
    </div>
  )
}

export default function CommunityCafePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusPostId = searchParams.get('post')
  const { user } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [content, setContent] = useState('')
  const [attachedSong, setAttachedSong] = useState<Song | null>(null)
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [pollOptions, setPollOptions] = useState<string[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const [posting, setPosting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [comments, setComments] = useState<Record<string, CommunityPostComment[]>>({})
  const [openComment, setOpenComment] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const commentSubmittingRef = useRef(false)
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null)
  const [reportPostId, setReportPostId] = useState<string | null>(null)
  const [confirmDelPost, setConfirmDelPost] = useState<CommunityPost | null>(null)
  const [confirmKick, setConfirmKick] = useState<CommunityPost | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null)
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const hasScrolledRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ?post=id 로 진입 시 최초 1회만 스크롤 + 하이라이트 (posts 변경 시 재실행 방지)
  useEffect(() => {
    if (!focusPostId || !posts || hasScrolledRef.current) return
    const el = postRefs.current[focusPostId]
    if (!el) return
    hasScrolledRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightPostId(focusPostId)
    const t = setTimeout(() => setHighlightPostId(null), 2000)
    return () => clearTimeout(t)
  }, [focusPostId, posts])

  const load = useCallback(async () => {
    const [d, p, reported] = await Promise.all([
      fetch(`/api/communities/${id}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/communities/${id}/posts`).then(r => r.ok ? r.json() : { posts: [] }),
      getMyReportedPostIds(),
    ])
    if (!d) { setCommunity(null); setPosts([]); return }
    setCommunity(d.community); setMembers(d.members ?? [])
    setPosts((p.posts ?? []).filter((x: CommunityPost) => !reported.has(x.id)))
  }, [id, user?.id])
  useEffect(() => { load() }, [load])

  // 작성 textarea auto-grow — 최소 h-20(80px), 내용 따라 최대 240px까지 확장
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [content])

  async function join() {
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    setBusy(true)
    const res = await fetch(`/api/communities/${id}/join`, { method: 'POST' })
    setBusy(false)
    if (res.ok) { toast.success('가입했어요'); load() } else toast.error('가입에 실패했어요')
  }
  async function leave() {
    setBusy(true)
    const res = await fetch(`/api/communities/${id}/leave`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) { toast.success('탈퇴했어요'); load() }
    else toast.error(j.error === 'manager_cannot_leave' ? '매니저는 탈퇴할 수 없어요 (폐쇄만 가능)' : '탈퇴에 실패했어요')
  }
  const pollReady = (pollOptions?.filter((o) => o.trim()).length ?? 0) >= 2
  // 첨부는 한 종류만 (음악/이미지/투표 중 하나) — 활성 시 + 버튼 숨김. 링크는 본문 URL로 자동 임베드.
  const hasAttachment = !!attachedSong || attachedImages.length > 0 || !!pollOptions
  const hasComposeContent = !!content.trim() || !!attachedSong || attachedImages.length > 0 || pollReady
  async function submitPost() {
    if (posting || !hasComposeContent) return
    setPosting(true)
    const res = await fetch(`/api/communities/${id}/posts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content.trim(), songId: attachedSong?.id ?? null, imageUrls: attachedImages,
        pollOptions: pollOptions ? pollOptions.map((o) => o.trim()).filter(Boolean) : [],
      }),
    })
    const j = await res.json().catch(() => ({}))
    setPosting(false)
    if (!res.ok) { toast.error(j.error === 'not_member' ? '멤버만 글을 쓸 수 있어요' : j.error === 'banned_word' ? '부적절한 표현이 포함되어 있어요' : j.error === 'song_not_public' ? '게시된 곡만 첨부할 수 있어요' : '작성에 실패했어요'); return }
    setContent(''); setAttachedSong(null); setAttachedImages([]); setPollOptions(null); load()
    toast.success('글을 게시했어요')
  }

  async function handleImageFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = 10 - attachedImages.length
    if (remaining <= 0) { toast.error('이미지는 최대 10장까지 첨부할 수 있어요'); return }
    const picked = Array.from(files).slice(0, remaining)
    setUploadingImages(true)
    const fd = new FormData()
    picked.forEach((f) => fd.append('files', f))
    const res = await fetch(`/api/communities/${id}/post-images`, { method: 'POST', body: fd })
    setUploadingImages(false)
    if (!res.ok) { toast.error('이미지 업로드에 실패했어요'); return }
    const j = await res.json()
    setAttachedImages((prev) => [...prev, ...(j.urls ?? [])].slice(0, 10))
  }

  // 참여 게이트 — 비로그인=로그인, 미가입=가입 안내 스낵바
  function memberGate(): boolean {
    if (!user) { window.dispatchEvent(new Event('open-login')); return false }
    if (!community?.isMember && !community?.isManager) { toast.info('먼저 커뮤니티에 가입해주세요'); return false }
    return true
  }
  async function toggleLike(p: CommunityPost) {
    if (!memberGate()) return
    // 낙관적 업데이트 + 실패 시 롤백
    const apply = (like: boolean) => setPosts(prev => prev?.map(x => x.id === p.id ? { ...x, liked: like, likeCount: x.likeCount + (like ? 1 : -1) } : x) ?? null)
    const wasLiked = !!p.liked
    apply(!wasLiked)
    try {
      const res = await fetch(`/api/community-posts/${p.id}/like`, { method: 'POST' })
      if (!res.ok) apply(wasLiked)
    } catch { apply(wasLiked) }
  }
  async function togglePin(p: CommunityPost) {
    const res = await fetch(`/api/community-posts/${p.id}/pin`, { method: 'POST' })
    if (res.ok) load(); else toast.error('고정에 실패했어요')
  }
  async function kick(p: CommunityPost) {
    const res = await fetch(`/api/communities/${id}/kick`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: p.authorId }),
    })
    if (res.ok) { toast.success(`${p.authorName ?? '사용자'}님을 내보냈어요`); load() }
    else toast.error('강퇴에 실패했어요')
  }
  async function del(p: CommunityPost) {
    const res = await fetch(`/api/community-posts/${p.id}`, { method: 'DELETE' })
    if (res.ok) { setPosts(prev => prev?.filter(x => x.id !== p.id) ?? null); toast.success('글을 삭제했어요') } else toast.error('삭제에 실패했어요')
  }
  function goProfile(username: string | null) {
    if (username) window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))
  }
  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/community/${id}`)
      toast.success('링크를 복사했어요')
    } catch { toast.error('링크 복사에 실패했어요') }
  }
  // 폐쇄 유예 중 본인 글·댓글 JSON 내보내기(세이프가드 ③)
  async function exportMyContent() {
    try {
      const res = await fetch(`/api/communities/${id}/my-content-export`)
      if (!res.ok) { toast.error('내보내기에 실패했어요'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${community?.name ?? 'community'}-내글.txt`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('내 글을 내보냈어요')
    } catch { toast.error('내보내기에 실패했어요') }
  }
  function startEdit(p: CommunityPost) {
    setEditingPost(p)
    setMoreOpenId(null)
  }
  function onEditSaved(patch: Partial<CommunityPost>) {
    if (!editingPost) return
    setPosts(prev => prev?.map(x => x.id === editingPost.id ? { ...x, ...patch } : x) ?? null)
  }
  function reportDone(postId: string) {
    setPosts(prev => prev?.filter(x => x.id !== postId) ?? null)  // 즉시 블라인드
  }
  const refetchComments = useCallback(async (postId: string) => {
    const j = await fetch(`/api/community-posts/${postId}/comments`).then(r => r.json()).catch(() => ({ comments: [] }))
    const list: CommunityPostComment[] = j.comments ?? []
    setComments(prev => ({ ...prev, [postId]: list }))
    setPosts(prev => prev?.map(x => x.id === postId ? { ...x, commentCount: countComments(list) } : x) ?? null)
  }, [])
  async function openComments(postId: string) {
    if (openComment === postId) { setOpenComment(null); return }
    setOpenComment(postId)
    if (!comments[postId]) await refetchComments(postId)
  }
  async function addComment(postId: string) {
    if (!memberGate()) return
    if (!commentText.trim() || commentSubmittingRef.current) return  // 중복 제출 가드
    commentSubmittingRef.current = true
    try {
      const res = await fetch(`/api/community-posts/${postId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: commentText.trim() }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error === 'banned_word' ? '부적절한 표현이 포함되어 있어요' : '댓글 작성에 실패했어요'); return }
      setCommentText('')
      await refetchComments(postId)
    } finally { commentSubmittingRef.current = false }
  }

  if (community === null && posts !== null) {
    return <div className="h-full flex items-center justify-center text-sm text-zinc-500">커뮤니티를 찾을 수 없어요.</div>
  }

  const isManager = !!community?.isManager
  const isMember = !!community?.isMember
  const isClosing = community?.status === 'closing'
  const closingDaysLeft = community?.closeScheduledAt ? Math.max(0, Math.ceil((new Date(community.closeScheduledAt).getTime() - Date.now()) / 86400000)) : 0
  const cover = community?.coverImage
    ? { backgroundImage: `url(${community.coverImage})`, backgroundSize: 'cover', backgroundPosition: community.coverFocus ?? 'center' }
    : { background: GRAY_COVER }

  // 역할별 액션 버튼(수정/탈퇴/가입). overlay=모바일 커버 오버레이(프로필 토큰) / false=데스크탑 타이틀 우측
  const roleButton = (overlay: boolean) => {
    // overlay=모바일 커버 오버레이(이미지 위 → black/25) / false=데스크탑 타이틀 행(어두운 bg → white 계열로 가시성 확보)
    const editCls = overlay
      ? 'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 transition-colors'
      : 'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/[0.08] text-white hover:bg-white/[0.14] transition-colors'
    const leaveCls = overlay
      ? 'px-4 py-2 rounded-full text-sm font-medium bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 transition-colors'
      : 'px-4 py-2 rounded-full text-sm font-medium bg-white/[0.08] text-zinc-300 hover:bg-white/[0.14] transition-colors'
    const joinCls = 'px-4 py-2 rounded-full text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors'
    const shareCls = overlay
      ? 'w-9 h-9 rounded-full flex items-center justify-center bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 transition active:scale-95'
      : 'w-9 h-9 rounded-full flex items-center justify-center bg-white/[0.08] text-white hover:bg-white/[0.14] transition active:scale-95'
    const shareBtn = (
      <button onClick={copyShareLink} aria-label="공유" className={shareCls}>
        <Image src="/Share.svg" alt="" width={15} height={15} style={{ filter: 'invert(1)' }} />
      </button>
    )
    const roleBtn = isManager
      ? <button onClick={() => setEditOpen(true)} className={editCls}><Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} /> 수정</button>
      : isMember
        ? <button onClick={() => setConfirmLeave(true)} className={leaveCls}>탈퇴하기</button>
        : <button onClick={busy ? undefined : join} className={joinCls}>가입하기</button>
    return <div className="flex items-center gap-2">{roleBtn}{shareBtn}</div>
  }

  // 로딩 — 헤더·피드 스켈레톤 (폴백 헤더 플래시 방지). not-found는 위에서 이미 처리됨
  if (community === null) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="relative w-full aspect-[9/4] md:aspect-[7/2] max-h-[300px] bg-white/[0.04] shimmer" />
        <div className="max-w-[680px] mx-auto pb-10">
          <div className="px-5 -mt-10 relative">
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-[96px] h-[96px] rounded-2xl bg-white/[0.06] shimmer ring-4 ring-[#111318]" />
              <div className="flex-1 space-y-2.5">
                <div className="h-6 w-44 rounded-lg bg-white/[0.04] shimmer" />
                <div className="h-4 w-24 rounded bg-white/[0.04] shimmer" />
              </div>
            </div>
            <div className="h-4 w-2/3 rounded bg-white/[0.04] shimmer mt-4" />
          </div>
          <div className="mt-6 md:px-5 divide-y divide-white/[0.06] md:divide-y-0 md:space-y-3">
            {[0, 1].map(i => (
              <div key={i} className="px-4 py-4 md:p-4 md:rounded-2xl md:border md:border-white/[0.08] md:bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[34px] h-[34px] rounded-full bg-white/[0.04] shimmer shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-24 rounded bg-white/[0.04] shimmer" />
                    <div className="h-3 w-16 rounded bg-white/[0.04] shimmer" />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-white/[0.04] shimmer" />
                  <div className="h-3.5 w-1/2 rounded bg-white/[0.04] shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      {/* 커버 — 좌우 풀폭, 유튜브 채널 배너형(와이드·짧게). 모바일 2.5:1 · 데스크탑 4:1 */}
      <div className="relative w-full aspect-[9/4] md:aspect-[7/2] max-h-[300px] overflow-hidden" style={cover}>
        {/* 위 70% 원본 · 하단 30%만 배경색 블렌드 */}
        <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#111318] to-transparent pointer-events-none" />
        {/* 모바일: 프로필처럼 커버 우상단 액션 버튼 */}
        <div className="absolute top-3 right-3 z-10 md:hidden">{roleButton(true)}</div>
      </div>
      {/* 컨텐츠 — 좁게 중앙. 하단 여백은 맨 위로 플로팅 버튼·바텀네비 회피 */}
      <div className="max-w-[680px] mx-auto pb-28 md:pb-20">
        <div className="px-5 -mt-10 relative">
          {/* 타이틀 행: 사각 대표 이미지 + 이름 + 매니저 수정 버튼(프로필 토큰 통일) */}
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-[96px] h-[96px] rounded-2xl overflow-hidden flex items-center justify-center text-4xl font-bold"
              style={{ background: GRAY_AVATAR, color: GRAY_AVATAR_TEXT }}>
              {community?.avatarImage ? <img src={community.avatarImage} alt="" className="w-full h-full object-cover" /> : (community?.name ?? '?').slice(0, 1).toUpperCase()}
            </div>
            {/* 우측 컬럼: 타이틀 + (아랫줄) 멤버 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="flex-1 min-w-0 text-2xl font-bold text-white break-words">{community?.name ?? ''}</h1>
                {/* 데스크탑: 타이틀 우측 (모바일은 커버 오버레이) */}
                <div className="hidden md:block shrink-0">{roleButton(false)}</div>
              </div>
              <button onClick={() => members.length > 0 && setMembersOpen(true)} className="flex items-center gap-3 mt-2 group">
                <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">멤버 {community?.memberCount ?? 0}</span>
                <div className="flex -space-x-2">{members.slice(0, 5).map(m => <div key={m.userId} className="ring-2 ring-[#111318] rounded-full"><Avatar name={m.displayName ?? m.username} hue={m.avatarHue} url={m.avatarUrl} size={24} /></div>)}</div>
              </button>
            </div>
          </div>
          {/* 정보(소개) */}
          {community?.description && <p className="text-sm text-zinc-400 mt-4 whitespace-pre-wrap leading-relaxed">{community.description}</p>}
          {/* 카테고리 */}
          {community?.topic && <span className="inline-block mt-3 px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 text-xs font-medium">{community.topic}</span>}
        </div>

        {/* 폐쇄 예고 배너 (§13.3 세이프가드 ② — closing 동안 상시 노출, D-day + 내보내기) */}
        {isClosing && (
          <div className="px-5 mt-5">
            <div className="rounded-xl bg-red-500/[0.08] border border-red-500/20 px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-300">폐쇄 예정 · D-{closingDaysLeft}</p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">이 커뮤니티는 곧 폐쇄돼요. 지금은 읽기전용이에요. 내가 작성한 글을 미리 저장해두세요.</p>
              </div>
              {(isMember || isManager) && (
                <button onClick={exportMyContent} className="shrink-0 px-3.5 py-2 rounded-full text-xs font-medium bg-white/[0.10] text-white hover:bg-white/[0.16] transition-colors">내 글 내보내기</button>
              )}
            </div>
          </div>
        )}

        {/* 글쓰기 (멤버·매니저) — 폐쇄 유예 중이면 읽기전용이라 숨김 */}
        {(isMember || isManager) && !isClosing && (
          <div className="px-5 mt-6">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
              <textarea ref={contentRef} value={content} onChange={(e) => setContent(e.target.value)} placeholder="이 커뮤니티에 글을 남겨보세요" maxLength={CONTENT_MAX}
                className="w-full min-h-[80px] max-h-[240px] bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none resize-none overflow-y-auto" />

              {/* 첨부 이미지 미리보기 (최대 10) */}
              {(attachedImages.length > 0 || uploadingImages) && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachedImages.map((url, i) => (
                    <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/[0.08]">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center">
                        <Image src="/Close-Fill.svg" alt="제거" width={10} height={10} style={{ filter: 'invert(1)' }} />
                      </button>
                    </div>
                  ))}
                  {uploadingImages && <div className="w-16 h-16 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>}
                </div>
              )}

              {/* 투표 작성 (2~4 옵션, 24h 후 종료) */}
              {pollOptions && (
                <div className="mb-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">24시간 후 종료</span>
                    <button onClick={() => setPollOptions(null)} className="text-xs font-medium text-zinc-300 hover:text-white transition-colors">투표 제거</button>
                  </div>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={opt} onChange={(e) => setPollOptions((prev) => prev!.map((o, j) => (j === i ? e.target.value : o)))} maxLength={40} placeholder={`옵션 ${i + 1}`}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions((prev) => prev!.filter((_, j) => j !== i))} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/[0.08]">
                          <Image src="/Close-Fill.svg" alt="제거" width={11} height={11} style={{ filter: 'invert(0.5)' }} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 4 && (
                    <button onClick={() => setPollOptions((prev) => [...prev!, ''])} className="text-xs text-violet-400 hover:text-violet-300">+ 옵션 추가</button>
                  )}
                </div>
              )}

              {/* 첨부된 곡 칩 */}
              {attachedSong && (
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-2">
                  <SongCover coverImage={attachedSong.coverImage} coverHue={attachedSong.coverHue} size={36} />
                  <span className="text-sm text-white truncate flex-1">{attachedSong.title || '제목 없음'}</span>
                  <button onClick={() => setAttachedSong(null)} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition active:scale-90">
                    <Image src="/Close-Fill.svg" alt="제거" width={14} height={14} style={{ filter: 'invert(0.5)' }} />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between relative">
                {/* + 첨부 메뉴 (첨부 하나 선택 시 숨김 — 중복 방지) */}
                <div className="relative">
                  {!hasAttachment && <>
                  <button onClick={() => setPlusMenuOpen((v) => !v)} className="w-8 h-8 rounded-full bg-[#252A35] hover:bg-[#2C313D] flex items-center justify-center transition active:scale-[0.96]" aria-label="첨부">
                    <Image src="/Add.svg" alt="" width={16} height={16} style={{ filter: 'invert(1)' }} />
                  </button>
                  {plusMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[54]" onClick={() => setPlusMenuOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-2 z-[55] w-40 bg-[#21252E] border border-white/[0.10] rounded-xl shadow-xl overflow-hidden py-1">
                        <button onClick={() => { setPlusMenuOpen(false); setPickerOpen(true) }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition text-left">
                          <Image src="/Music.svg" alt="" width={15} height={15} style={{ filter: 'invert(0.6)' }} /> 내 음악 첨부
                        </button>
                        <button onClick={() => { setPlusMenuOpen(false); imageInputRef.current?.click() }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition text-left">
                          <Image src="/Photo-Album.svg" alt="" width={15} height={15} style={{ filter: 'invert(0.6)' }} /> 이미지 첨부
                        </button>
                        <button onClick={() => { setPlusMenuOpen(false); if (!pollOptions) setPollOptions(['', '']) }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white hover:bg-white/[0.06] transition text-left">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/></svg> 투표
                        </button>
                      </div>
                    </>
                  )}
                  {pickerOpen && (
                    <>
                      <div className="fixed inset-0 z-[54]" onClick={() => setPickerOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-2 z-[55] w-72 max-h-72 overflow-y-auto bg-[#21252E] border border-white/[0.10] rounded-xl shadow-xl p-1.5">
                        {songService.getAll().filter((s) => s.status === 'done' && s.published).length === 0 ? (
                          <p className="text-xs text-zinc-500 py-4 text-center">게시한 곡이 없어요</p>
                        ) : songService.getAll().filter((s) => s.status === 'done' && s.published).map((s) => (
                          <button key={s.id} onClick={() => { setAttachedSong(s); setPickerOpen(false) }} className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.06] transition text-left">
                            <SongCover coverImage={s.coverImage} coverHue={s.coverHue} size={32} />
                            <span className="text-sm text-white truncate">{s.title || '제목 없음'}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  </>}
                </div>
                <div className="flex items-center gap-2.5">
                  <CharCount length={content.length} limit={CONTENT_MAX} />
                  <button onClick={submitPost} disabled={posting || uploadingImages || !hasComposeContent} className="px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-40">{posting ? '게시 중…' : '게시'}</button>
                </div>
              </div>

              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleImageFiles(e.target.files); e.target.value = '' }} />
            </div>
            {/* 게시 시점 고지 (§13.6 법적 방어 핵심) */}
            <p className="text-[11px] text-zinc-600 mt-2 px-1">커뮤니티가 폐쇄되면 이 글은 삭제될 수 있어요.</p>
          </div>
        )}

        {/* 피드 — 모바일: 라인 구분(풀폭·박스 X) / 데스크탑: 박스 카드 */}
        <div className="mt-6 md:px-5 divide-y divide-white/[0.06] md:divide-y-0 md:space-y-3">
          {posts === null ? (
            [0, 1].map(i => (
              <div key={i} className="px-4 py-4 md:p-4 md:rounded-2xl md:border md:border-white/[0.08] md:bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[34px] h-[34px] rounded-full bg-white/[0.04] shimmer shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-24 rounded bg-white/[0.04] shimmer" />
                    <div className="h-3 w-16 rounded bg-white/[0.04] shimmer" />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-white/[0.04] shimmer" />
                  <div className="h-3.5 w-1/2 rounded bg-white/[0.04] shimmer" />
                </div>
              </div>
            ))
          ) : posts.length === 0 ? (
            <p className="text-sm text-zinc-500 py-10 text-center">아직 글이 없어요. {isMember ? '첫 글을 남겨보세요!' : '가입하고 첫 글을 남겨보세요!'}</p>
          ) : posts.map(p => {
            const canDelete = p.authorId === user?.id || isManager
            return (
              <div key={p.id} ref={el => { postRefs.current[p.id] = el }} className={`px-4 py-4 md:rounded-2xl md:border md:border-white/[0.08] md:bg-white/[0.02] transition-colors duration-700 ${highlightPostId === p.id ? 'bg-violet-500/10 md:border-violet-500/30' : ''}`}>
                {p.pinned && (
                  <div className="flex items-center gap-1.5 mb-3 pb-2.5 border-b border-white/[0.06] text-sm font-medium text-white">
                    <Image src="/Pin.svg" alt="" width={15} height={15} style={{ filter: 'invert(1)' }} />
                    매니저가 상단 고정함
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <button onClick={() => goProfile(p.authorUsername)} disabled={!p.authorUsername} className="shrink-0 disabled:cursor-default transition active:scale-95">
                    <Avatar name={p.authorName} hue={p.authorAvatarHue} url={p.authorAvatarUrl} size={34} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button onClick={() => goProfile(p.authorUsername)} disabled={!p.authorUsername} className="text-sm font-medium text-white truncate hover:underline disabled:no-underline disabled:cursor-default">{p.authorName ?? '익명'}</button>
                      {p.authorId === community?.managerId && <span className="shrink-0 text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full leading-none">매니저</span>}
                    </div>
                    <p className="text-[11px] text-zinc-500">{relativeTime(p.createdAt)}</p>
                  </div>
                  <div className="relative shrink-0">
                    <button onClick={() => setMoreOpenId(v => v === p.id ? null : p.id)} className="w-7 h-7 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-zinc-500 hover:text-white transition-colors" aria-label="더보기">
                      <Image src="/More.svg" alt="" width={16} height={16} style={{ filter: 'invert(0.5)' }} />
                    </button>
                    {moreOpenId === p.id && (
                      <>
                        <div className="fixed inset-0 z-[54]" onClick={() => setMoreOpenId(null)} />
                        <div className="absolute right-0 top-8 z-[55] w-32 bg-[#282D38] border border-white/[0.08] rounded-xl py-1 shadow-xl overflow-hidden">
                          {p.authorId === user?.id && (
                            <button onClick={() => startEdit(p)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition-colors">
                              <Image src="/Edit.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.55)' }} /> 수정
                            </button>
                          )}
                          {isManager && (
                            <button onClick={() => { setMoreOpenId(null); togglePin(p) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition-colors">
                              <Image src="/Pin.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.55)' }} />
                              {p.pinned ? '고정해제' : '고정'}
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => { setMoreOpenId(null); setConfirmDelPost(p) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                              <Image src="/Delete-2.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 삭제
                            </button>
                          )}
                          {isManager && p.authorId !== community?.managerId && (
                            <button onClick={() => { setMoreOpenId(null); setConfirmKick(p) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>
                              강퇴
                            </button>
                          )}
                          {user && p.authorId !== user.id && (
                            <button onClick={() => { setMoreOpenId(null); setReportPostId(p.id) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                              <Image src="/Flag.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 신고
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {p.content ? (
                  <p className="text-sm text-zinc-200 mt-2.5 whitespace-pre-wrap leading-relaxed">{linkify(p.content)}</p>
                ) : null}
                {p.imageUrls && p.imageUrls.length > 0 && <PostImageGallery images={p.imageUrls} />}
                {/* 임베드/미리보기 — 명시 첨부 우선, 없으면 본문 첫 URL 자동 감지 */}
                {(() => {
                  const url = p.linkUrl || (p.content ? firstUrl(p.content) : null)
                  return url ? <PostEmbed url={url} /> : null
                })()}
                {p.poll && <PollCard poll={p.poll} postId={p.id} gate={memberGate} />}
                {p.song && <SongEmbedCard song={p.song} artist={p.authorName} ownerUserId={p.authorId} ownerAvatarUrl={p.authorAvatarUrl} ownerAvatarHue={p.authorAvatarHue} currentUserId={user?.id ?? null} />}
                <div className="flex items-center gap-4 mt-3">
                  <button onClick={() => toggleLike(p)} className={`text-sm flex items-center gap-1.5 transition active:scale-95 ${p.liked ? 'text-violet-300' : 'text-zinc-500 hover:text-white'}`}>
                    <Image src="/Thumb-Up.svg" alt="좋아요" width={18} height={18} style={{ filter: p.liked ? VIOLET_FILTER : 'invert(0.4)' }} /> {p.likeCount}
                  </button>
                  <button onClick={() => openComments(p.id)} className="text-sm flex items-center gap-1.5 text-zinc-500 hover:text-white transition active:scale-95">
                    <Image src="/chat.svg" alt="댓글" width={18} height={18} style={{ filter: 'invert(0.4)' }} /> {p.commentCount}
                  </button>
                </div>

                {openComment === p.id && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                    {(comments[p.id] ?? []).map(cm => (
                      <CommunityCommentItem
                        key={cm.id}
                        comment={cm}
                        currentUserId={user?.id ?? null}
                        isManager={isManager}
                        onMutated={() => refetchComments(p.id)}
                        gate={memberGate}
                      />
                    ))}
                    <div className="relative pt-1">
                      <input value={commentText} onChange={(e) => setCommentText(e.target.value)} maxLength={500} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addComment(p.id) }} placeholder="댓글 달기" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-full pl-4 pr-12 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                      <button onClick={() => addComment(p.id)} aria-label="등록"
                        className={`absolute right-1.5 top-1/2 mt-0.5 w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition duration-200 active:scale-90 ${commentText.trim() ? 'opacity-100 scale-100 -translate-y-1/2' : 'opacity-0 scale-50 -translate-y-1/2 pointer-events-none'}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <ConfirmModal open={!!confirmDelPost} title="이 글을 정말 삭제하시겠어요?" description="삭제 시 등록된 댓글도 함께 삭제되며 되돌릴 수 없어요." confirmLabel="삭제하기" cancelLabel="아니요" variant="danger" onClose={() => setConfirmDelPost(null)} onConfirm={() => { if (confirmDelPost) del(confirmDelPost); setConfirmDelPost(null) }} />
      <ConfirmModal open={!!confirmKick} title={`${confirmKick?.authorName ?? '이 사용자'}님을 강퇴할까요?`} description="커뮤니티에서 내보내지고 알림이 전송돼요. 이 회원은 다시 가입할 수 있어요." confirmLabel="강퇴하기" cancelLabel="아니요" variant="danger" onClose={() => setConfirmKick(null)} onConfirm={() => { if (confirmKick) kick(confirmKick); setConfirmKick(null) }} />
      <ConfirmModal open={confirmLeave} title="이 커뮤니티를 정말 탈퇴하시겠어요?" description="탈퇴하면 이 커뮤니티에 다시 가입해야 글·댓글을 남길 수 있어요." confirmLabel="탈퇴하기" cancelLabel="아니요" variant="danger" busy={busy} onClose={() => setConfirmLeave(false)} onConfirm={() => { setConfirmLeave(false); leave() }} />
      {reportPostId && <CommunityPostReportModal postId={reportPostId} onClose={() => setReportPostId(null)} onSubmitted={() => reportDone(reportPostId)} />}
      {editOpen && community && <CommunityEditModal community={community} onClose={() => setEditOpen(false)} onSaved={(c) => setCommunity(c)} onClosed={() => router.push('/community')} />}
      {membersOpen && community && <CommunityMembersModal members={members} managerId={community.managerId} onClose={() => setMembersOpen(false)} />}
      {editingPost && <CommunityPostEditModal post={editingPost} communityId={id} onClose={() => setEditingPost(null)} onSaved={onEditSaved} />}
      <ScrollToTopButton scrollRef={scrollRef} />
    </div>
  )
}
