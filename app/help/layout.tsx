// /help 전용 layout — (legal)의 max-w-[720px] 제약 없이 풀폭 패널·본문 분할 위함.
// 헤더·푸터는 (legal)과 동일 톤.

import Image from 'next/image'
import Link from 'next/link'

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    // h-screen + overflow-hidden 체인 — 페이지 전체 스크롤 막고 우측 본문만 스크롤되게.
    // 좌측 사이드 패널은 그 자리에 고정 (sticky 불필요, 처음부터 안 움직임).
    <div className="h-screen bg-[#171A20] text-white flex flex-col overflow-hidden">
      <header className="shrink-0 h-14 flex items-center px-5 border-b border-white/[0.06] bg-[#111318]">
        <Link href="/">
          <Image src="/logo.svg" alt="모두의 노래" width={72} height={16} style={{ filter: 'invert(1)' }} />
        </Link>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      <footer className="shrink-0 px-6 py-6 text-center text-[11px] text-zinc-600 border-t border-white/[0.04]">
        © 2026 주식회사 비누컴퍼니 — 모두의 노래
      </footer>
    </div>
  )
}
