'use client'

import { useState } from 'react'
import { SongForm } from '@/features/song/components/SongForm'
import { MyWorkPanel } from '@/features/song/components/MyWorkPanel'

export default function CreatePage() {
  // 모바일 전용 탭 상태 — 데스크톱은 layout 우측에 MyWorkPanel 별도 표시
  const [tab, setTab] = useState<'create' | 'mywork'>('create')

  return (
    <div className="flex flex-col h-full">
      {/* 모바일 탭바 — 데스크톱에선 숨김 */}
      <div className="md:hidden flex border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => setTab('create')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'create'
              ? 'text-white border-b-2 border-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          음악 만들기
        </button>
        <button
          onClick={() => setTab('mywork')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'mywork'
              ? 'text-white border-b-2 border-white'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          내 음악
        </button>
      </div>

      {/* 모바일: 활성 탭에 따라 표시 (상태 보존 위해 둘 다 mount, display 토글) */}
      <div className={`md:hidden flex-1 min-h-0 overflow-y-auto ${tab !== 'create' ? 'hidden' : ''}`}>
        <div className="px-6 py-6">
          <SongForm />
        </div>
      </div>
      <div className={`md:hidden flex-1 min-h-0 overflow-hidden ${tab !== 'mywork' ? 'hidden' : ''}`}>
        <MyWorkPanel showCollections />
      </div>

      {/* 데스크톱: SongForm만 (MyWorkPanel은 layout 우측 패널이 담당) */}
      <div className="hidden md:block px-6 py-6">
        <h1 className="text-xl font-semibold mb-6">음악 만들기</h1>
        <SongForm />
      </div>
    </div>
  )
}
