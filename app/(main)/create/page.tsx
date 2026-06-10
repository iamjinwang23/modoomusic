import { SongForm } from '@/features/song/components/SongForm'

export default function CreatePage() {
  // 모바일에선 '내 음악' 라이브러리 탭이 따로 있어서 중복 — SongForm만 표시
  // 데스크톱은 layout 우측에 MyWorkPanel 별도
  return (
    <div className="px-6 pt-6 min-h-full flex flex-col">
      <SongForm />
    </div>
  )
}
