import Link from 'next/link'
import { AuthForm } from '@/features/auth/components/AuthForm'

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <Link href="/" className="font-bold text-violet-400">
          모두의 노래
        </Link>
      </nav>

      <div className="max-w-sm mx-auto px-6 py-16 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">시작하기</h1>
          <p className="text-zinc-400 text-sm">로그인하면 내 음악을 영원히 보관할 수 있어요</p>
        </div>

        <AuthForm />
      </div>
    </main>
  )
}
