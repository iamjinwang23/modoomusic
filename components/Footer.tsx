// 전자상거래법 제10조 사업자정보 표시 + 사이트맵 + 약관/정책 링크 푸터.
// 서버/클라이언트 양쪽에서 렌더 가능한 순수 표현 컴포넌트 (훅 없음).
import Link from 'next/link'

const SITEMAP: { href: string; label: string }[] = [
  { href: '/', label: '둘러보기' },
  { href: '/create', label: '음악 만들기' },
  { href: '/library', label: '라이브러리' },
  { href: '/announcements', label: "What's New" },
]

const POLICIES: { href: string; label: string; strong?: boolean }[] = [
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침', strong: true },
  { href: '/terms#payment', label: '취소·환불 정책' },
  { href: '/policy', label: '운영정책' },
]

const SUPPORT: { href: string; label: string; external?: boolean }[] = [
  { href: '/help', label: '도움말', external: true },
  { href: '/faq', label: '자주 묻는 질문', external: true },
  { href: 'mailto:bee202408@gmail.com', label: '문의하기', external: true },
]

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-semibold text-zinc-400">{title}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#0E1014] text-zinc-400">
      <div className="max-w-[1100px] mx-auto px-6 py-10">
        {/* 링크 그리드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
          <Col title="서비스">
            {SITEMAP.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[13px] text-zinc-400 hover:text-white transition-colors">{l.label}</Link>
              </li>
            ))}
          </Col>
          <Col title="약관·정책">
            {POLICIES.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`text-[13px] transition-colors hover:text-white ${l.strong ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>{l.label}</Link>
              </li>
            ))}
          </Col>
          <Col title="고객지원">
            {SUPPORT.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  {...(l.external && !l.href.startsWith('mailto:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="text-[13px] text-zinc-400 hover:text-white transition-colors"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </Col>
        </div>

        {/* 사업자 정보 (전자상거래법 제10조) */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] space-y-1.5 text-[11px] leading-relaxed text-zinc-500">
          <p className="text-zinc-400 font-medium">주식회사 비누컴퍼니</p>
          <p>
            대표 공봉환 · 사업자등록번호 415-86-01210 · 통신판매업신고 2024-서울중구-1875
          </p>
          <p>
            주소 서울특별시 중구 을지로 158, 5층 504-1호 (을지로4가, 삼풍상가)
          </p>
          <p>
            고객센터 02-6261-1550 · 이메일 bee202408@gmail.com · 개인정보보호책임자 공봉환
          </p>
          <p className="pt-2 text-zinc-600">© 2026 주식회사 비누컴퍼니. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
