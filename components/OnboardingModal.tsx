'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/toast/toast'
import type { User } from '@supabase/supabase-js'

// ── 랜덤 이름 생성 ──────────────────────────────────────────────
const MOODS = ['행복한', '즐거운', '신나는', '자유로운', '차분한', '따뜻한', '멋진', '귀여운', '용감한', '엉뚱한', '신비로운', '활발한']
const ANIMALS = ['너구리', '고양이', '토끼', '여우', '판다', '코알라', '수달', '다람쥐', '부엉이', '펭귄', '햄스터', '고슴도치']

function randomDisplayName() {
  const mood = MOODS[Math.floor(Math.random() * MOODS.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  const num = String(Math.floor(Math.random() * 9000) + 1000)
  return `${mood}${animal}_${num}`
}

function randomUsername() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'mono_'
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

// provider별 metadata 키가 달라(full_name·name·given_name/family_name·nickname 등) 후보를 순서대로 시도.
// Apple은 최초 인증에 'Name' scope 동의했을 때만 이름이 metadata에 들어옴 — 거부하면 fallback.
function pickInitialDisplayName(user: User): string {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const candidates: (string | null)[] = [
    str(m.full_name),
    str(m.name),
    str(m.display_name),
    str(m.given_name) && str(m.family_name) ? `${str(m.given_name)} ${str(m.family_name)}` : null,
    str(m.given_name),
    str(m.nickname),
    str(m.preferred_username),
  ]
  for (const c of candidates) {
    if (c) return c.slice(0, 30)
  }
  return randomDisplayName()
}

// ── 아이디 유효성 ────────────────────────────────────────────────
function validateUsername(v: string): string | null {
  if (!v) return '아이디를 입력해주세요'
  if (!/^[a-z0-9._]{1,30}$/.test(v)) return '영문 소문자, 숫자, ., _ 만 사용할 수 있어요 (최대 30자)'
  if (/\.\./.test(v) || v.startsWith('.') || v.endsWith('.')) return '마침표는 연속으로 쓰거나 앞뒤에 올 수 없어요'
  return null
}

// ── 단계 데이터 ──────────────────────────────────────────────────
const SOURCES = [
  { id: 'instagram', label: '인스타그램' },
  { id: 'youtube',   label: '유튜브' },
  { id: 'friend',    label: '친구/지인 추천' },
  { id: 'ad',        label: '광고' },
  { id: 'etc',       label: '기타' },
]

const AI_EXPS = [
  { id: 'never',  label: '완전 처음이에요, 기대돼요!' },
  { id: 'little', label: '한두 번 써봤는데 아직 낯설어요' },
  { id: 'often',  label: '꽤 자주 쓰는 편이에요' },
  { id: 'daily',  label: '거의 매일 쓸 정도로 빠져있어요' },
]

const GOALS = [
  { id: 'create',  label: '내 노래를 직접 만들어볼래요' },
  { id: 'listen',  label: '좋은 음악 듣고 싶어요' },
  { id: 'content', label: 'SNS에 올릴 콘텐츠 만들고 싶어요' },
  { id: 'browse',  label: '일단 구경하러 왔어요' },
]

// ── 공통 옵션 버튼 ────────────────────────────────────────────────
function OptionBtn({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
        selected
          ? 'border-violet-500 bg-violet-500/10 text-white'
          : 'border-white/[0.10] bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
interface Props {
  user: User
  onDone: () => void
}

export function OnboardingModal({ user, onDone }: Props) {
  const [step, setStep] = useState(1)
  const [source, setSource] = useState('')
  const [aiExp, setAiExp] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [displayName, setDisplayName] = useState(() => pickInitialDisplayName(user))
  const [username, setUsername] = useState(() => randomUsername())
  const [usernameMsg, setUsernameMsg] = useState('')
  const [usernameOk, setUsernameOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 아이디 실시간 중복 확인
  useEffect(() => {
    const validationError = validateUsername(username)
    if (validationError) {
      setUsernameMsg(validationError)
      setUsernameOk(false)
      return
    }
    setUsernameMsg('확인 중…')
    setUsernameOk(false)
    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/check-username?username=${encodeURIComponent(username)}`)
      const { available } = await res.json()
      if (available) {
        setUsernameMsg('사용할 수 있어요 ✓')
        setUsernameOk(true)
      } else {
        setUsernameMsg('이미 사용 중인 아이디예요')
        setUsernameOk(false)
      }
    }, 500)
  }, [username])

  async function handleFinish() {
    if (!usernameOk || !displayName.trim() || saving) return
    setSaving(true)
    const supabase = createClient()
    const finalUsername = username.toLowerCase()
    const finalName = displayName.trim()
    await Promise.all([
      supabase.from('profiles').upsert({
        id: user.id,
        username: finalUsername,
        display_name: finalName,
        onboarding_done: true,
        onboarding_source: source,
        onboarding_ai_exp: aiExp,
        onboarding_goals: goals,
      }),
      supabase.auth.updateUser({
        data: { username: finalUsername, full_name: finalName },
      }),
    ])
    toast.success('회원가입이 완료되었어요')
    onDone()
  }

  const canNext =
    (step === 1 && !!source) ||
    (step === 2 && !!aiExp) ||
    (step === 3 && goals.length > 0) ||
    (step === 4 && !!displayName.trim() && usernameOk)

  function toggleGoal(id: string) {
    setGoals((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id])
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      {/* Backdrop — 클릭 불가 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 flex rounded-2xl overflow-hidden w-full max-w-[740px] h-[560px] bg-[#181B22] border border-white/[0.10] shadow-2xl mx-4">

        {/* ── 왼쪽 이미지 패널 ── */}
        <div className="hidden md:block w-[300px] shrink-0 relative">
          <Image
            src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=85"
            alt="music"
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-7 left-6 right-6">
            <p className="text-white font-bold text-lg leading-snug">모두가 만드는<br />세상의 모든 노래, MONO</p>
          </div>
        </div>

        {/* ── 오른쪽 콘텐츠 패널 ── */}
        <div className="flex-1 flex flex-col px-8 py-8 overflow-hidden">

          {/* 프로그레스 */}
          <div className="flex gap-1.5 mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-violet-500' : 'bg-white/[0.10]'}`}
              />
            ))}
          </div>

          {/* ── Step 1: 유입 경로 ── */}
          {step === 1 && (
            <div className="flex flex-col flex-1 min-h-0">
              <p className="text-xs text-zinc-500 mb-1">1 / 4</p>
              <h2 className="text-xl font-bold text-white mb-1">모노는 어떻게 알게 됐어요?</h2>
              <p className="text-sm text-zinc-500 mb-6">궁금해서요, 솔직하게 말해줘도 돼요 😊</p>
              <div className="space-y-2 overflow-y-auto flex-1">
                {SOURCES.map((o) => (
                  <OptionBtn key={o.id} label={o.label} selected={source === o.id} onClick={() => setSource(o.id)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: AI 경험 ── */}
          {step === 2 && (
            <div className="flex flex-col flex-1 min-h-0">
              <p className="text-xs text-zinc-500 mb-1">2 / 4</p>
              <h2 className="text-xl font-bold text-white mb-1">AI로 뭔가 만들어본 적 있어요?</h2>
              <p className="text-sm text-zinc-500 mb-6">어떤 레벨이든 다 환영이에요 🙌</p>
              <div className="space-y-2 overflow-y-auto flex-1">
                {AI_EXPS.map((o) => (
                  <OptionBtn key={o.id} label={o.label} selected={aiExp === o.id} onClick={() => setAiExp(o.id)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: 목표 ── */}
          {step === 3 && (
            <div className="flex flex-col flex-1 min-h-0">
              <p className="text-xs text-zinc-500 mb-1">3 / 4</p>
              <h2 className="text-xl font-bold text-white mb-1">모노에서 뭘 해보고 싶어요?</h2>
              <p className="text-sm text-zinc-500 mb-6">여러 개 골라도 돼요 🎵</p>
              <div className="space-y-2 overflow-y-auto flex-1">
                {GOALS.map((o) => (
                  <OptionBtn key={o.id} label={o.label} selected={goals.includes(o.id)} onClick={() => toggleGoal(o.id)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Step 4: 프로필 설정 ── */}
          {step === 4 && (
            <div className="flex flex-col flex-1 min-h-0">
              <p className="text-xs text-zinc-500 mb-1">4 / 4</p>
              <h2 className="text-xl font-bold text-white mb-1">어떻게 불러드릴까요?</h2>
              <p className="text-sm text-zinc-500 mb-6">나중에 설정에서 바꿀 수 있어요 ✏️</p>

              <div className="space-y-4 flex-1">
                {/* 표시 이름 */}
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">이름</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={30}
                    placeholder="이름을 입력해주세요"
                    className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors"
                  />
                </div>

                {/* 아이디 */}
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">아이디</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    maxLength={30}
                    placeholder="영문, 숫자, ., _"
                    className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-violet-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-colors"
                  />
                  {usernameMsg && (
                    <p className={`text-xs mt-1.5 ${usernameOk ? 'text-teal-400' : 'text-red-400'}`}>
                      {usernameMsg}
                    </p>
                  )}
                  <p className="text-[11px] text-zinc-600 mt-1">영문 소문자, 숫자, 마침표(.), 언더스코어(_) · 최대 30자</p>
                </div>
              </div>
            </div>
          )}

          {/* ── 하단 버튼 ── */}
          <div className="flex items-center gap-3 mt-6">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white border border-white/[0.10] hover:border-white/20 transition-colors"
              >
                이전
              </button>
            )}
            <button
              type="button"
              disabled={!canNext || saving}
              onClick={() => {
                if (step < 4) setStep((s) => s + 1)
                else handleFinish()
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                canNext && !saving
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-white/[0.06] text-zinc-600 cursor-not-allowed'
              }`}
            >
              {step < 4 ? '다음' : saving ? '저장 중…' : '모노 시작하기 🎶'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
