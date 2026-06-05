import { redirect } from 'next/navigation'

// 2026-06-05: / (root)가 둘러보기로 변경됨에 따라 /explore는 영구 redirect
export default function ExploreRedirect() {
  redirect('/')
}
