import { SongForm } from '@/features/song/components/SongForm'

export default function CreatePage() {
  return (
    <div className="px-6 py-6">
      <h1 className="text-xl font-semibold mb-6">음악 만들기</h1>
      <SongForm />
    </div>
  )
}
