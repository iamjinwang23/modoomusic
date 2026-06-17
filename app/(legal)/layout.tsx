import Image from 'next/image'
import Link from 'next/link'
import { Footer } from '@/components/Footer'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#171A20] text-white flex flex-col">
      <header className="shrink-0 h-14 flex items-center px-5 border-b border-white/[0.06] bg-[#111318]">
        <Link href="/">
          <Image src="/logo.svg" alt="모두의 노래" width={72} height={16} style={{ filter: 'invert(1)' }} />
        </Link>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-12">
        <div className="max-w-[720px] mx-auto">{children}</div>
      </main>
      <Footer />
    </div>
  )
}
