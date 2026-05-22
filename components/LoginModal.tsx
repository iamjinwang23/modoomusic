'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/toast/toast'

interface Props {
  onClose: () => void
}

function SocialButton({ onClick, className, children }: { onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full relative flex items-center justify-center py-3 rounded-xl text-sm font-medium transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

export function LoginModal({ onClose }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleGoogleLogin() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  async function handleKakaoLogin() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex rounded-2xl overflow-hidden w-full max-w-[740px] bg-[#181B22] shadow-2xl">

        {/* ── Left: Image panel ── */}
        <div className="hidden md:block w-[300px] shrink-0 relative">
          <Image
            src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=85"
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

        {/* ── Right: Login panel ── */}
        <div className="flex-1 flex flex-col px-9 py-10">
          {/* Logo */}
          <Image src="/logo.svg" alt="모두의 노래" width={72} height={16} style={{ filter: 'invert(1)' }} className="mb-8" />

          <h2 className="text-2xl font-bold text-white mb-1 font-mono">오신 걸 환영해요</h2>
          <p className="text-zinc-400 text-sm mb-8">가입하고 무료로 음악을 만들어보세요</p>

          <div className="space-y-3">
            {/* Google */}
            <SocialButton onClick={handleGoogleLogin} className={`bg-white hover:bg-zinc-100 text-zinc-900 ${loading ? 'opacity-70 pointer-events-none' : ''}`}>
              <span className="absolute left-4 flex items-center">
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
              </span>
              Google로 계속하기
            </SocialButton>

            {/* Apple */}
            <SocialButton onClick={() => toast.info('Apple 로그인은 곧 지원될 예정이에요')} className="bg-[#21252E] hover:bg-[#2D323E] border border-white/10 text-white">
              <span className="absolute left-4 flex items-center">
                <svg width="16" height="18" viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg" fill="white">
                  <path d="M13.23 9.36c-.02-1.9 1.56-2.82 1.63-2.87-1.12-1.63-2.85-1.86-3.47-1.88-1.48-.15-2.9.87-3.65.87-.76 0-1.93-.85-3.17-.83C2.89 4.68 1.31 5.72.5 7.3c-1.63 2.82-.42 7 1.15 9.29.78 1.12 1.7 2.38 2.91 2.33 1.17-.05 1.61-.75 3.03-.75 1.41 0 1.81.75 3.05.72 1.26-.02 2.05-1.14 2.82-2.27.9-1.3 1.26-2.57 1.28-2.63-.03-.01-2.44-.93-2.46-3.67-.02-2.3 1.88-3.4 1.96-3.46z"/>
                  <path d="M10.4.75C11 .04 11.69-.5 12.37-.5c.04.91-.2 1.82-.79 2.52-.58.7-1.32 1.18-2.11 1.11-.05-.89.23-1.78.93-2.38z"/>
                </svg>
              </span>
              Apple로 계속하기
            </SocialButton>

            {/* Kakao */}
            <SocialButton onClick={handleKakaoLogin} className={`bg-[#FEE500] hover:bg-[#fdd800] text-[#191919] ${loading ? 'opacity-70 pointer-events-none' : ''}`}>
              <span className="absolute left-4 flex items-center">
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 1.5C4.86 1.5 1.5 4.16 1.5 7.44c0 2.09 1.32 3.93 3.32 4.99l-.84 3.12a.25.25 0 0 0 .37.28L8.1 13.7c.29.03.59.05.9.05 4.14 0 7.5-2.66 7.5-5.94S13.14 1.5 9 1.5z" fill="#191919"/>
                </svg>
              </span>
              카카오로 계속하기
            </SocialButton>
          </div>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs text-zinc-600">
              <span className="bg-[#181B22] px-2">또는</span>
            </div>
          </div>

          {/* Email */}
          <SocialButton onClick={() => toast.info('이메일 로그인은 곧 지원될 예정이에요')} className="border border-white/[0.10] hover:border-white/20 text-zinc-300 hover:text-white">
            <span className="absolute left-4 flex items-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </span>
            이메일로 계속하기
          </SocialButton>

          <p className="text-xs text-zinc-600 mt-8 text-center leading-relaxed">
            계속하면{' '}
            <a href="#" className="underline hover:text-zinc-400">이용약관</a>
            {' '}과{' '}
            <a href="#" className="underline hover:text-zinc-400">개인정보처리방침</a>
            에 동의합니다
          </p>
        </div>


        {/* Close — thicker X */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-black/60 hover:bg-white flex items-center justify-center text-white hover:text-zinc-900 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
