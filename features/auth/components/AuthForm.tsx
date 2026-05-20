'use client'

import { useState } from 'react'

export function AuthForm() {
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    alert(`[껍데기] ${tab === 'login' ? '로그인' : '가입'} — Supabase 연동 전`)
  }

  return (
    <div className="bg-zinc-800 rounded-2xl p-6 space-y-5">
      {/* Tabs */}
      <div className="flex bg-zinc-900 rounded-xl p-1 gap-1">
        {(['login', 'signup'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t === 'login' ? '로그인' : '가입'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-zinc-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-zinc-600"
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-zinc-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-zinc-600"
          required
        />
        <button
          type="submit"
          className="w-full bg-violet-600 hover:bg-violet-500 rounded-xl py-3 text-sm font-semibold transition-colors"
        >
          {tab === 'login' ? '로그인' : '가입하기'}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-700" />
        </div>
        <div className="relative flex justify-center text-xs text-zinc-500">
          <span className="bg-zinc-800 px-2">또는</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => alert('[껍데기] 카카오 로그인 — 연동 전')}
        className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 rounded-xl py-3 text-sm font-semibold transition-colors"
      >
        카카오로 시작하기
      </button>
    </div>
  )
}
