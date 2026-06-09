// Design Ref: account-deletion — 탈퇴 완료 후 작별 페이지
// 모달에서 탈퇴 처리 + signOut 후 router.replace('/farewell')로 진입.
// 7일 grace period 안내까지 함께 보여줌 → 변심 시 자연 복원 가능.

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: '안녕히 가세요 — 모두의 노래',
  description: '탈퇴가 완료되었어요. 함께해주셔서 감사합니다.',
  robots: { index: false, follow: false },
}

export default function FarewellPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12 bg-[#0e1014] text-white">
      <div className="w-full max-w-md text-center">
        <Image
          src="/logo.svg"
          alt="모두의 노래"
          width={96}
          height={22}
          style={{ filter: 'invert(1)' }}
          className="mx-auto mb-10 opacity-90"
        />

        <h1 className="text-2xl font-bold mb-4 leading-tight">
          그동안 함께해주셔서<br />감사했어요
        </h1>

        <p className="text-sm text-zinc-400 leading-relaxed mb-8">
          탈퇴가 정상적으로 처리되었어요.<br />
          여러분이 만든 노래와 시간이 저희에게는 큰 의미였습니다.
        </p>

        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-5 py-4 mb-10 text-xs text-zinc-400 leading-relaxed">
          마음이 바뀌신다면 <span className="text-white font-medium">7일 이내</span>에
          같은 계정으로 다시 로그인해 주세요.<br />
          모든 데이터가 자동으로 복원됩니다.
        </div>

        <Link
          href="/"
          className="inline-block w-full py-3 rounded-xl bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition-colors"
        >
          홈으로 돌아가기
        </Link>

        <p className="text-xs text-zinc-600 mt-8">
          언젠가 다시 만나뵙길 바라요 — MONO
        </p>
      </div>
    </main>
  )
}
