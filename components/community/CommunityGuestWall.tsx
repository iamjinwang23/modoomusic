'use client'
// 미로그인 소프트 월 오버레이 — 커뮤니티 상세 위에 블러 + 로그인 CTA. 로그인 시(가입 안 해도) 사라짐.
import Link from 'next/link'

export function CommunityGuestWall() {
  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-[#0B0D12]/70 backdrop-blur-md" />
      <div
        className="relative z-10 w-full md:max-w-sm m-4 rounded-2xl bg-[#181B22] border border-white/[0.10] shadow-2xl p-6 text-center"
        style={{ marginBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      >
        <h2 className="text-lg font-bold text-white">로그인하고 계속 둘러보세요</h2>
        <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
          로그인하면 모든 커뮤니티의 글을 자유롭게 볼 수 있어요.
        </p>
        <button
          onClick={() => window.dispatchEvent(new Event('open-login'))}
          className="mt-5 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
        >
          로그인 / 회원가입
        </button>
        <Link href="/community" className="mt-3 inline-block text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          허브로 돌아가기
        </Link>
      </div>
    </div>
  )
}
