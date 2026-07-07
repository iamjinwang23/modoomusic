'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/toast/toast'
import { profileColor } from '@/utils/profileColor'
import type { SocialLinks } from '@mono/shared'
import { AccountDeletionModal } from '@/components/AccountDeletionModal'

const NAME_MAX = 30
const USERNAME_MAX = 30
const BIO_MAX = 160

const NAME_CHANGE_LIMIT = 2          // 14일 안에 최대 2회
const NAME_CHANGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

function validateUsername(v: string): string | null {
  if (!v) return '아이디를 입력해주세요'
  if (v.length < 4) return '아이디는 최소 4자 이상이어야 해요'
  if (!/^[a-z0-9._]{1,30}$/.test(v)) return '영문 소문자, 숫자, ., _ 만 사용할 수 있어요 (최대 30자)'
  if (/\.\./.test(v) || v.startsWith('.') || v.endsWith('.')) return '마침표는 연속으로 쓰거나 앞뒤에 올 수 없어요'
  return null
}

function normalizeUrl(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function daysFromNow(iso: string): number {
  const diff = (new Date(iso).getTime() + NAME_CHANGE_WINDOW_MS) - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

const SOCIAL_FIELDS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: 'instagram', label: '인스타그램', placeholder: 'instagram.com/username' },
  { key: 'tiktok',    label: '틱톡',      placeholder: 'tiktok.com/@username' },
  { key: 'youtube',   label: '유튜브',     placeholder: 'youtube.com/@channel' },
  { key: 'facebook',  label: '페이스북',   placeholder: 'facebook.com/username' },
  { key: 'x',         label: 'X',         placeholder: 'x.com/username' },
]

interface Initial {
  username: string
  displayName: string
  bio: string
  links: SocialLinks
  usernameChangedAt: string | null
  nameChangeLog: string[]
}

interface ImageProps {
  avatarUrl: string | null
  coverUrl: string | null
  avatarHue: number
  initials: string
  uploading: 'avatar' | 'cover' | null
  onAvatarUpload: (file: File) => void
  onAvatarDelete: () => void
  onCoverUpload: (file: File) => void
  onCoverDelete: () => void
}

interface Props {
  userId: string
  initial: Initial
  images?: ImageProps
  onClose: () => void
  onSaved: (next: {
    username: string
    displayName: string
    bio: string | null
    links: SocialLinks
    usernameChangedAt: string | null
    nameChangeLog: string[]
  }) => void
}

export function ProfileEditModal({ userId, initial, images, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [username, setUsername] = useState(initial.username)
  const [bio, setBio] = useState(initial.bio)
  const [links, setLinks] = useState<Record<keyof SocialLinks, string>>({
    instagram: initial.links.instagram ?? '',
    tiktok:    initial.links.tiktok    ?? '',
    youtube:   initial.links.youtube   ?? '',
    facebook:  initial.links.facebook  ?? '',
    x:         initial.links.x         ?? '',
  })
  const [usernameMsg, setUsernameMsg] = useState('')
  const [usernameOk, setUsernameOk] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletionOpen, setDeletionOpen] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const coverFileRef = useRef<HTMLInputElement>(null)
  const avatarFileRef = useRef<HTMLInputElement>(null)

  // ── 정책 계산 ────────────────────────────────────────────────
  const usernameLocked = initial.usernameChangedAt !== null

  const recentNameChanges = useMemo(
    () => initial.nameChangeLog.filter((t) => Date.now() - new Date(t).getTime() < NAME_CHANGE_WINDOW_MS),
    [initial.nameChangeLog],
  )
  const nameLocked = recentNameChanges.length >= NAME_CHANGE_LIMIT
  const nextNameUnlockDays = nameLocked
    ? daysFromNow(recentNameChanges[0])  // 가장 오래된 변경이 14일을 넘기면 풀림
    : 0

  // ── 아이디 유효성/중복 체크 ──────────────────────────────────
  useEffect(() => {
    if (usernameLocked) { setUsernameMsg(''); setUsernameOk(true); return }
    const trimmed = username.toLowerCase()
    if (trimmed === initial.username) {
      setUsernameMsg('')
      setUsernameOk(true)
      return
    }
    const err = validateUsername(trimmed)
    if (err) { setUsernameMsg(err); setUsernameOk(false); return }
    setUsernameMsg('확인 중…')
    setUsernameOk(false)
    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/check-username?username=${encodeURIComponent(trimmed)}`)
      const { available } = await res.json()
      if (available) { setUsernameMsg('사용할 수 있어요 ✓'); setUsernameOk(true) }
      else            { setUsernameMsg('이미 사용 중인 아이디예요'); setUsernameOk(false) }
    }, 500)
  }, [username, initial.username, usernameLocked])

  const nameChanged = displayName.trim() !== initial.displayName.trim()
  const nameBlockedByPolicy = nameChanged && nameLocked

  const canSave = !!displayName.trim() && usernameOk && !saving && !nameBlockedByPolicy

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const finalUsername = usernameLocked ? initial.username : username.toLowerCase()
    const finalName = displayName.trim()
    const finalBio = bio.trim() || null
    const normalizedLinks: SocialLinks = {
      instagram: normalizeUrl(links.instagram),
      tiktok:    normalizeUrl(links.tiktok),
      youtube:   normalizeUrl(links.youtube),
      facebook:  normalizeUrl(links.facebook),
      x:         normalizeUrl(links.x),
    }

    const usernameDidChange = !usernameLocked && finalUsername !== initial.username
    const nowIso = new Date().toISOString()
    const nextUsernameChangedAt = usernameDidChange ? nowIso : initial.usernameChangedAt
    const nextNameLog = nameChanged
      ? [...recentNameChanges, nowIso]
      : recentNameChanges  // 14일 지난 옛 항목은 자동 정리

    const update: Record<string, unknown> = {
      display_name:    finalName,
      bio:             finalBio,
      link_instagram:  normalizedLinks.instagram,
      link_tiktok:     normalizedLinks.tiktok,
      link_youtube:    normalizedLinks.youtube,
      link_facebook:   normalizedLinks.facebook,
      link_x:          normalizedLinks.x,
      name_change_log: nextNameLog,
    }
    if (usernameDidChange) {
      update.username = finalUsername
      update.username_changed_at = nextUsernameChangedAt
    }

    const { error: dbError } = await supabase.from('profiles').update(update).eq('id', userId)

    if (dbError) {
      setSaving(false)
      setError('저장 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.')
      toast.error('저장 중 오류가 발생했어요', { action: { label: '다시 시도', onClick: handleSave } })
      return
    }

    await supabase.auth.updateUser({ data: { username: finalUsername, full_name: finalName } })

    setSaving(false)
    toast.success('프로필이 업데이트되었어요')
    onSaved({
      username: finalUsername,
      displayName: finalName,
      bio: finalBio,
      links: normalizedLinks,
      usernameChangedAt: nextUsernameChangedAt,
      nameChangeLog: nextNameLog,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm md:block hidden" onClick={onClose} />
      <div className="absolute inset-0 md:hidden" onClick={onClose} />

      <div className="relative z-10 w-full h-full md:h-auto md:max-w-[480px] md:max-h-[85vh] md:mx-4 bg-[#181B22] md:border border-white/[0.10] rounded-none md:rounded-2xl shadow-2xl flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white">프로필 수정</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors w-7 h-7 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* 이미지 */}
          {images && (
            <div className="space-y-4">
              {/* 커버 */}
              <div>
                <label className="text-xs text-zinc-500">커버 이미지</label>
                <div
                  className="relative w-full aspect-[1064/368] rounded-xl overflow-hidden mt-1.5"
                  style={{ background: profileColor(images.avatarHue).bg }}
                >
                  {images.coverUrl && (
                    <Image src={images.coverUrl} alt="" fill className="object-cover" unoptimized />
                  )}
                  {images.uploading === 'cover' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" onClick={() => coverFileRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12] transition-colors">커버 변경</button>
                  {images.coverUrl && (
                    <button type="button" onClick={images.onCoverDelete} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">삭제</button>
                  )}
                </div>
                <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) images.onCoverUpload(f); e.target.value = '' }} />
              </div>

              {/* 아바타 */}
              <div>
                <label className="text-xs text-zinc-500">프로필 사진</label>
                <div
                  className="relative w-[88px] h-[88px] rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold mt-1.5"
                  style={{ background: profileColor(images.avatarHue).bg, color: profileColor(images.avatarHue).text }}
                >
                  {images.avatarUrl ? (
                    <Image src={images.avatarUrl} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    images.initials
                  )}
                  {images.uploading === 'avatar' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" onClick={() => avatarFileRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12] transition-colors">프로필 사진 변경</button>
                  {images.avatarUrl && (
                    <button type="button" onClick={images.onAvatarDelete} className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">삭제</button>
                  )}
                </div>
                <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) images.onAvatarUpload(f); e.target.value = '' }} />
              </div>
            </div>
          )}

          {/* 이름 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">이름</label>
              <span className="text-[11px] text-zinc-600">{displayName.length} / {NAME_MAX}</span>
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder="화면에 표시될 이름"
              className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors"
            />
            {nameBlockedByPolicy ? (
              <p className="text-[11px] text-red-400 mt-1.5">
                14일 안에 이름을 {NAME_CHANGE_LIMIT}회 변경했어요. {nextNameUnlockDays}일 후 다시 변경할 수 있어요.
              </p>
            ) : (
              <p className="text-[11px] text-zinc-600 mt-1.5">
                이름은 14일 안에 최대 {NAME_CHANGE_LIMIT}회까지 변경할 수 있어요
                {recentNameChanges.length > 0 && ` (지금까지 ${recentNameChanges.length}회 사용)`}
              </p>
            )}
          </div>

          {/* 아이디 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">아이디</label>
              <span className="text-[11px] text-zinc-600">{username.length} / {USERNAME_MAX}</span>
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => !usernameLocked && setUsername(e.target.value.toLowerCase())}
              maxLength={USERNAME_MAX}
              disabled={usernameLocked}
              placeholder="한 번 바꾸면 다시 변경할 수 없어요. 신중히 결정해 주세요"
              className={`w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors ${
                usernameLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
            {usernameLocked ? (
              <p className="text-[11px] text-zinc-500 mt-1.5">아이디는 1회만 변경할 수 있어요. 이미 변경했어요.</p>
            ) : (
              <>
                {usernameMsg && (
                  <p className={`text-xs mt-1.5 ${usernameOk ? 'text-teal-400' : 'text-red-400'}`}>
                    {usernameMsg}
                  </p>
                )}
                <p className="text-[11px] text-amber-400/80 mt-1">⚠️ 아이디는 평생 1회만 변경할 수 있어요. 신중히 결정해 주세요</p>
              </>
            )}
          </div>

          {/* 소개 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">소개</label>
              <span className="text-[11px] text-zinc-600">{bio.length} / {BIO_MAX}</span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX}
              rows={3}
              placeholder="간단한 소개를 적어주세요"
              className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors resize-none"
            />
          </div>

          {/* SNS */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">SNS 링크</p>
            <div className="space-y-2">
              {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-zinc-400">{label}</span>
                  <input
                    type="url"
                    value={links[key]}
                    onChange={(e) => setLinks((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="flex-1 bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Design Ref: account-deletion §5.1 — 조용한 회색 링크 */}
          <div className="pt-2 pb-1">
            <button
              type="button"
              onClick={() => setDeletionOpen(true)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              회원 탈퇴
            </button>
          </div>
        </div>

        <AccountDeletionModal open={deletionOpen} onClose={() => setDeletionOpen(false)} />

        <div className="flex items-center gap-3 px-6 py-4 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3.5 rounded-xl text-sm text-zinc-400 hover:text-white border border-white/[0.10] hover:border-white/20 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className={`flex-1 py-3.5 rounded-xl text-sm font-semibold transition-colors ${
              canSave
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
            }`}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
