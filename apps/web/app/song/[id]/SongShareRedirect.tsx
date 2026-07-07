'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 크롤러는 page.tsx의 generateMetadata로 OG 미리보기 받음.
// 실제 사용자(JS 활성)는 마운트 즉시 SPA 진입(/?song={id})으로 이동.
// JS 비활성 사용자용 noscript fallback: meta-refresh로 같은 곳으로 이동.
export function SongShareRedirect({ songId }: { songId: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(`/?song=${songId}`)
  }, [songId, router])

  return (
    <>
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=/?song=${songId}`} />
      </noscript>
      <div className="min-h-screen flex items-center justify-center bg-[#111318] text-zinc-400 text-sm">
        <p>이동 중…</p>
      </div>
    </>
  )
}
