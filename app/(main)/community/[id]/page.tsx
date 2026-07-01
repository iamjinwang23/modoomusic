// 커뮤니티(카페) 상세 — 헤더·가입/탈퇴·글쓰기(멤버)·피드·좋아요·댓글·고정/삭제(관리)
'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { ConfirmModal } from '@/components/ConfirmModal'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import { relativeTime } from '@/utils/relativeTime'
import { songService } from '@/services/song.service'
import { exploreService } from '@/services/explore.service'
import { CommunityCommentItem } from '@/components/community/CommunityCommentItem'
import { CommunityPostReportModal } from '@/components/community/CommunityPostReportModal'
import { CommunityEditModal } from '@/components/community/CommunityEditModal'
import { CommunityMembersModal } from '@/components/community/CommunityMembersModal'
import { getMyReportedPostIds } from '@/services/report.service'
import type { Community, CommunityPost, CommunityMember, CommunityPostComment, Song } from '@/types/domain'

const VIOLET_FILTER = 'brightness(0) saturate(100%) invert(44%) sepia(51%) saturate(1569%) hue-rotate(221deg) brightness(101%) contrast(96%)'

function countComments(list: CommunityPostComment[]): number {
  return list.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)
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
  const { user } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [members, setMembers] = useState<CommunityMember[]>([])
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [content, setContent] = useState('')
  const [attachedSong, setAttachedSong] = useState<Song | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [comments, setComments] = useState<Record<string, CommunityPostComment[]>>({})
  const [openComment, setOpenComment] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [reportPostId, setReportPostId] = useState<string | null>(null)
  const [confirmDelPost, setConfirmDelPost] = useState<CommunityPost | null>(null)

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
  async function submitPost() {
    if (posting || (!content.trim() && !attachedSong)) return
    setPosting(true)
    const res = await fetch(`/api/communities/${id}/posts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim(), songId: attachedSong?.id ?? null }),
    })
    const j = await res.json().catch(() => ({}))
    setPosting(false)
    if (!res.ok) { toast.error(j.error === 'not_member' ? '멤버만 글을 쓸 수 있어요' : '작성에 실패했어요'); return }
    setContent(''); setAttachedSong(null); load()
  }

  async function playSong(songId: string) {
    const pub = await exploreService.getShareSongById(songId)
    if (!pub) { toast.error('재생할 수 없는 곡이에요 (비공개)'); return }
    window.dispatchEvent(new CustomEvent('view-song', { detail: {
      feed: [{ id: pub.id, createdAt: pub.createdAt, title: pub.title, prompt: pub.prompt, genre: pub.genre, mood: pub.mood, customLyrics: null, lyrics: pub.lyrics, instrumental: pub.instrumental, audioUrl: pub.audioUrl, duration: pub.duration ?? null, liked: pub.isLiked, coverHue: pub.coverHue, coverImage: pub.coverImage, model: pub.model, videoCoverUrl: pub.videoCoverUrl, videoCoverStatus: pub.videoCoverStatus }],
      idx: 0, isOwner: !!user && pub.userId === user.id, ownerName: pub.displayName, ownerAvatarUrl: pub.avatarUrl ?? null, ownerUserId: pub.userId, ownerAvatarHue: pub.avatarHue ?? null,
    } }))
  }
  async function toggleLike(p: CommunityPost) {
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    setPosts(prev => prev?.map(x => x.id === p.id ? { ...x, liked: !x.liked, likeCount: x.likeCount + (x.liked ? -1 : 1) } : x) ?? null)
    await fetch(`/api/community-posts/${p.id}/like`, { method: 'POST' }).catch(() => {})
  }
  async function togglePin(p: CommunityPost) {
    const res = await fetch(`/api/community-posts/${p.id}/pin`, { method: 'POST' })
    if (res.ok) load(); else toast.error('고정에 실패했어요')
  }
  async function del(p: CommunityPost) {
    const res = await fetch(`/api/community-posts/${p.id}`, { method: 'DELETE' })
    if (res.ok) { setPosts(prev => prev?.filter(x => x.id !== p.id) ?? null) } else toast.error('삭제에 실패했어요')
  }
  function startEdit(p: CommunityPost) {
    setEditingId(p.id); setEditContent(p.content); setMoreOpenId(null)
  }
  async function saveEdit(p: CommunityPost) {
    const text = editContent.trim()
    if (editSaving || (!text && !p.song && !p.imageUrl)) return
    setEditSaving(true)
    const res = await fetch(`/api/community-posts/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }),
    })
    setEditSaving(false)
    if (!res.ok) { toast.error('수정에 실패했어요'); return }
    const j = await res.json().catch(() => ({}))
    setPosts(prev => prev?.map(x => x.id === p.id ? { ...x, content: j.post?.content ?? text } : x) ?? null)
    setEditingId(null)
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
    if (!user) { window.dispatchEvent(new Event('open-login')); return }
    if (!commentText.trim()) return
    const res = await fetch(`/api/community-posts/${postId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: commentText.trim() }),
    })
    if (!res.ok) { toast.error('댓글 작성에 실패했어요'); return }
    setCommentText('')
    await refetchComments(postId)
  }

  if (community === null && posts !== null) {
    return <div className="h-full flex items-center justify-center text-sm text-zinc-500">커뮤니티를 찾을 수 없어요.</div>
  }

  const isManager = !!community?.isManager
  const isMember = !!community?.isMember
  const hue = community ? (community.id.charCodeAt(0) + community.id.charCodeAt(community.id.length - 1)) * 47 : 0
  const cover = community?.coverImage
    ? { backgroundImage: `url(${community.coverImage})`, backgroundSize: 'cover', backgroundPosition: community.coverFocus ?? 'center' }
    : { background: `linear-gradient(135deg, ${profileColor(hue).bg}, #161922)` }

  // 역할별 액션 버튼(수정/탈퇴/가입). overlay=모바일 커버 오버레이(프로필 토큰) / false=데스크탑 타이틀 우측
  const roleButton = (overlay: boolean) => {
    const editCls = 'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 transition-colors'
    const leaveCls = overlay
      ? 'px-4 py-2 rounded-full text-sm font-medium bg-black/25 backdrop-blur-sm text-white hover:bg-black/40 transition-colors'
      : 'px-4 py-2 rounded-full text-sm font-medium bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] transition-colors'
    const joinCls = 'px-4 py-2 rounded-full text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors'
    if (isManager) return <button onClick={() => setEditOpen(true)} className={editCls}><Image src="/Edit.svg" alt="" width={14} height={14} style={{ filter: 'invert(1)' }} /> 수정</button>
    if (isMember) return <button onClick={busy ? undefined : leave} className={leaveCls}>탈퇴하기</button>
    return <button onClick={busy ? undefined : join} className={joinCls}>가입하기</button>
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* 커버 — 좌우 풀폭, 유튜브 채널 배너형(와이드·짧게). 모바일 2.5:1 · 데스크탑 4:1 */}
      <div className="relative w-full aspect-[9/4] md:aspect-[7/2] max-h-[300px] overflow-hidden" style={cover}>
        <div className="absolute inset-0 bg-gradient-to-t from-[#111318] via-black/30 to-transparent" />
        {/* 모바일: 프로필처럼 커버 우상단 액션 버튼 */}
        <div className="absolute top-3 right-3 z-10 md:hidden">{roleButton(true)}</div>
      </div>
      {/* 컨텐츠 — 좁게 중앙 */}
      <div className="max-w-[680px] mx-auto pb-10">
        <div className="px-5 -mt-10 relative">
          {/* 타이틀 행: 사각 대표 이미지 + 이름 + 매니저 수정 버튼(프로필 토큰 통일) */}
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-[96px] h-[96px] rounded-2xl overflow-hidden flex items-center justify-center text-4xl font-bold"
              style={{ background: profileColor(hue).bg, color: profileColor(hue).text }}>
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

        {/* 글쓰기 (멤버·매니저) */}
        {(isMember || isManager) && (
          <div className="px-5 mt-6">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="이 커뮤니티에 글을 남겨보세요" maxLength={2000}
                className="w-full h-20 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none resize-none" />

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
                <button onClick={() => setPickerOpen((v) => !v)} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-white/[0.06]">
                  <Image src="/Music.svg" alt="" width={14} height={14} style={{ filter: 'invert(0.6)' }} /> 내 곡 첨부
                </button>
                <button onClick={submitPost} disabled={posting || (!content.trim() && !attachedSong)} className="px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition disabled:opacity-40">{posting ? '게시 중…' : '게시'}</button>

                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-[54]" onClick={() => setPickerOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 z-[55] w-72 max-h-72 overflow-y-auto bg-[#21252E] border border-white/[0.10] rounded-xl shadow-xl p-1.5">
                      {songService.getAll().filter((s) => s.status === 'done').length === 0 ? (
                        <p className="text-xs text-zinc-500 py-4 text-center">완성된 곡이 없어요</p>
                      ) : songService.getAll().filter((s) => s.status === 'done').map((s) => (
                        <button key={s.id} onClick={() => { setAttachedSong(s); setPickerOpen(false) }} className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/[0.06] transition text-left">
                          <SongCover coverImage={s.coverImage} coverHue={s.coverHue} size={32} />
                          <span className="text-sm text-white truncate">{s.title || '제목 없음'}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 피드 */}
        <div className="px-5 mt-6 space-y-3">
          {posts === null ? (
            [0, 1].map(i => <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />)
          ) : posts.length === 0 ? (
            <p className="text-sm text-zinc-500 py-10 text-center">아직 글이 없어요. {isMember ? '첫 글을 남겨보세요!' : '가입하고 첫 글을 남겨보세요!'}</p>
          ) : posts.map(p => {
            const canDelete = p.authorId === user?.id || isManager
            return (
              <div key={p.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar name={p.authorName} hue={p.authorAvatarHue} url={p.authorAvatarUrl} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.authorName ?? '익명'}</p>
                      {p.authorId === community?.managerId && <span className="shrink-0 text-[10px] font-medium text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded-full leading-none">매니저</span>}
                    </div>
                    <p className="text-[11px] text-zinc-500">{relativeTime(p.createdAt)}{p.pinned && <span className="text-violet-400"> · 고정</span>}</p>
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
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-4.5V5a2 2 0 0 0-2-2H8.5a2 2 0 0 0-2 2v7.5L5 17z"/></svg>
                              {p.pinned ? '고정해제' : '고정'}
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => { setMoreOpenId(null); setConfirmDelPost(p) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                              <Image src="/Delete-2.svg" alt="" width={12} height={12} style={{ filter: 'invert(0.4) sepia(1) saturate(3) hue-rotate(300deg)' }} /> 삭제
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
                {editingId === p.id ? (
                  <div className="mt-2.5 space-y-2">
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} maxLength={2000} autoFocus
                      className="w-full h-24 bg-white/[0.04] border border-white/[0.08] focus:border-violet-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors resize-none" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">취소</button>
                      <button onClick={() => saveEdit(p)} disabled={editSaving} className="text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition active:scale-[0.96]">{editSaving ? '저장 중…' : '저장'}</button>
                    </div>
                  </div>
                ) : p.content ? (
                  <p className="text-sm text-zinc-200 mt-2.5 whitespace-pre-wrap leading-relaxed">{p.content}</p>
                ) : null}
                {p.song && (
                  <button onClick={() => playSong(p.song!.id)} className="mt-2.5 w-full flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition text-left">
                    <SongCover coverImage={p.song.coverImage} coverHue={p.song.coverHue} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{p.song.title || '제목 없음'}</p>
                      <p className="text-[11px] text-violet-300 flex items-center gap-1"><Image src="/Play.svg" alt="" width={11} height={11} style={{ filter: VIOLET_FILTER }} /> 재생</p>
                    </div>
                  </button>
                )}
                <div className="flex items-center gap-4 mt-3">
                  <button onClick={() => toggleLike(p)} className={`text-xs flex items-center gap-1.5 transition active:scale-95 ${p.liked ? 'text-violet-300' : 'text-zinc-500 hover:text-white'}`}>
                    <Image src="/Thumb-Up.svg" alt="좋아요" width={15} height={15} style={{ filter: p.liked ? VIOLET_FILTER : 'invert(0.4)' }} /> {p.likeCount}
                  </button>
                  <button onClick={() => openComments(p.id)} className="text-xs flex items-center gap-1.5 text-zinc-500 hover:text-white transition active:scale-95">
                    <Image src="/chat.svg" alt="댓글" width={15} height={15} style={{ filter: 'invert(0.4)' }} /> {p.commentCount}
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
                        onLoginRequired={() => window.dispatchEvent(new Event('open-login'))}
                      />
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <input value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addComment(p.id) }} placeholder="댓글 달기" className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
                      <button onClick={() => addComment(p.id)} className="text-xs font-semibold text-violet-400 hover:text-violet-300 px-2">등록</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <ConfirmModal open={!!confirmDelPost} title="이 글을 정말 삭제하시겠어요?" description="삭제 시 등록된 댓글도 함께 삭제되며 되돌릴 수 없어요." confirmLabel="삭제하기" cancelLabel="아니요" variant="danger" onClose={() => setConfirmDelPost(null)} onConfirm={() => { if (confirmDelPost) del(confirmDelPost); setConfirmDelPost(null) }} />
      {reportPostId && <CommunityPostReportModal postId={reportPostId} onClose={() => setReportPostId(null)} onSubmitted={() => reportDone(reportPostId)} />}
      {editOpen && community && <CommunityEditModal community={community} onClose={() => setEditOpen(false)} onSaved={(c) => setCommunity(c)} onClosed={() => router.push('/community')} />}
      {membersOpen && community && <CommunityMembersModal members={members} managerId={community.managerId} onClose={() => setMembersOpen(false)} />}
    </div>
  )
}
