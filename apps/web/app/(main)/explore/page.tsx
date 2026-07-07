import { permanentRedirect } from 'next/navigation'

// 2026-06-05: / (root)가 둘러보기로 변경됨에 따라 /explore는 영구 redirect (308)
// SEO: 검색엔진이 색인 가치를 / 로 이전. 네이버 봇 307 미따라감 이슈 회피
export default function ExploreRedirect() {
  permanentRedirect('/')
}
