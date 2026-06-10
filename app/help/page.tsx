// 도움말 페이지 — 좌측 sticky 사이드 패널(목차) + 우측 스크롤 본문.
// 모바일은 본문 위 inline TOC + 단일 컬럼.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '도움말 — 모두의 노래',
  description: 'MONO 사용법 — 시작하기·음악 만들기·가사·공유·크레딧·친구 초대 한눈에 보기',
  openGraph: { title: '도움말 — 모두의 노래', description: 'MONO 사용법 — 시작하기·음악 만들기·가사·공유·크레딧·친구 초대 한눈에 보기' },
}

const TOC = [
  { id: 'getting-started', label: '시작하기' },
  { id: 'make-music',      label: '음악 만들기' },
  { id: 'lyrics',          label: '가사 작성' },
  { id: 'share',           label: '공유·게시' },
  { id: 'credits',         label: '크레딧' },
  { id: 'referral',        label: '친구 초대' },
  { id: 'report',          label: '신고·문의' },
] as const

export default function HelpPage() {
  return (
    <div className="flex h-full">
      {/* 좌측 사이드 패널 — 데스크톱 sticky 폭 고정 */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#111318] overflow-y-auto">
        <div className="px-5 py-6">
          <h2 className="text-base font-semibold text-white mb-4">목차</h2>
          <nav>
            <ul className="space-y-0.5">
              {TOC.map(({ id, label }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>

      {/* 우측 본문 — 스크롤 + TOC 클릭 시 부드러운 이동 (scroll-mt-6으로 헤더 여백 보정 이미 적용) */}
      <div className="flex-1 min-w-0 overflow-y-auto scroll-smooth">
        <article className="max-w-[760px] mx-auto px-5 md:px-10 py-10 md:py-14">
          <header className="mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">도움말</h1>
            <p className="text-zinc-400 text-sm md:text-base">모두의 노래(MONO)를 처음 시작하시는 분들을 위한 간단한 안내예요.</p>
          </header>

          {/* 모바일 inline TOC — 데스크톱 패널 미노출 시에만 */}
          <nav className="md:hidden mb-10 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2 font-semibold">목차</p>
            <ul className="flex flex-wrap gap-1.5">
              {TOC.map(({ id, label }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="inline-block px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-zinc-300 hover:text-white hover:bg-white/[0.12] transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-12 text-sm md:text-base leading-relaxed text-zinc-300">
            <Section id="getting-started" title="시작하기">
              <p>
                모두의 노래는 음악 경험이 없어도 누구나 한 줄 설명만으로 노래를 만들 수 있는 AI 작곡 플랫폼이에요.
              </p>
              <List items={[
                '상단 우측 **로그인** 버튼으로 Google·Kakao·Naver·Apple 중 하나를 골라 가입할 수 있어요.',
                '가입하면 매일 **10크레딧**이 자정에 자동으로 충전돼요.',
                '왼쪽 사이드바(모바일은 하단 탭)에서 둘러보기·음악 만들기·라이브러리·알림·프로필로 이동할 수 있어요.',
              ]} />
            </Section>

            <Section id="make-music" title="음악 만들기">
              <p
                dangerouslySetInnerHTML={{ __html: renderMd('{make} 페이지에서 **심플**과 **고급** 두 모드를 선택할 수 있어요.') }}
              />
              <SubTitle>심플 모드</SubTitle>
              <List items={[
                '"몽환적인 시티팝, 첫눈 오는 새벽" 처럼 곡 분위기·장면만 적으면 AI가 가사·제목·스타일을 다 채워 곡을 만들어 줘요.',
                '인스트루멘탈 토글을 켜면 보컬 없이 연주곡으로 만들어 줘요.',
                '한 곡당 보컬은 2크레딧, 인스트루멘탈은 10크레딧이에요.',
              ]} />
              <SubTitle>고급 모드</SubTitle>
              <List items={[
                '스타일·장르·무드·가사를 직접 조정하고 싶을 때 사용해요.',
                '제목은 비워두면 AI가 자동으로 채워 줘요.',
                '"AI 가사" 버튼으로 가사도 자동 생성할 수 있어요.',
              ]} />
              <SubTitle>음악 모델 (고급 모드에서 선택)</SubTitle>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left py-2 pr-4 text-xs text-zinc-500 font-semibold uppercase tracking-wider w-20">모델</th>
                      <th className="text-left py-2 pr-4 text-xs text-zinc-500 font-semibold uppercase tracking-wider">핵심</th>
                      <th className="text-right py-2 text-xs text-zinc-500 font-semibold uppercase tracking-wider w-20">크레딧</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableRow badge="{v20}" desc="빠르고 가벼운 보컬곡 전용. 가사가 꼭 필요하고 인스트루멘탈은 지원하지 않아요. 응답이 가장 빨라요." credit="2" />
                    <TableRow badge="{v25}" desc="보컬·연주곡 모두 가능. 가사는 선택이고 인스트루멘탈 토글을 켜면 연주곡도 만들어 줘요. 보컬 표현력이 2.0보다 풍부해요." credit="10" />
                    <TableRow badge="{v26}" desc="좋아하는 곡 분위기 참고(커버). 음원 파일을 함께 올리면 그 분위기를 본떠 새 곡을 만들어 줘요. 노래 디테일이 가장 정교해요." credit="10" />
                  </tbody>
                </table>
              </div>
              <p
                className="text-xs text-zinc-500 mt-3"
                dangerouslySetInnerHTML={{ __html: renderMd('※ 일일 10크레딧이 모두 소진되면 다음 날 자정까지 기다리거나 친구 초대 보너스를 사용할 수 있어요. 곡 카드·상세에 표시되는 {v20} {v25} {v26} 배지로 어떤 모델로 만들어진 곡인지 확인할 수 있어요.') }}
              />
            </Section>

            <Section id="lyrics" title="가사 작성">
              <List items={[
                '심플 모드는 가사가 자동으로 만들어지니 입력할 필요가 없어요.',
                '고급 모드에서 가사를 직접 적거나, 가사 영역 위 **AI 가사** 버튼으로 한 번에 만들 수 있어요.',
                'AI 가사는 15초 / 1분 사이 쿨다운이 있어요. 크레딧은 소모되지 않아요.',
                '가사에 `[Verse]`, `[Chorus]` 같은 구조 태그를 직접 적어도 잘 인식해요.',
              ]} />
            </Section>

            <Section id="share" title="공유·게시">
              <p>만든 곡은 두 가지 방식으로 공유할 수 있어요.</p>
              <SubTitle>비공개 공유 (링크)</SubTitle>
              <List items={[
                '곡 상세 페이지의 {share} 버튼으로 링크를 받아 친구에게 보낼 수 있어요.',
                '게시하지 않아도 링크를 받은 사람은 들을 수 있어요.',
                '둘러보기·검색·프로필에는 노출되지 않아요.',
              ]} />
              <SubTitle>공개 게시</SubTitle>
              <List items={[
                '{more} 메뉴의 {publish}를 누르면 둘러보기·검색·내 프로필에 공개돼요.',
                '게시 시 공개용 커버 이미지와 한 줄 코멘트를 따로 지정할 수 있어요.',
                '언제든 **게시 취소**로 비공개로 되돌릴 수 있어요.',
              ]} />
            </Section>

            <Section id="credits" title="크레딧">
              <List items={[
                '일일 10크레딧은 매일 KST 자정에 자동 충전되며 이월되지 않아요.',
                '친구 초대로 받은 보너스 크레딧은 영구 보관되고, 곡 생성 시 보너스가 먼저 사용돼요.',
                '곡 생성 실패 시 크레딧은 자동으로 환불돼요.',
                '관리자 계정은 일일 100크레딧이 부여돼요.',
              ]} />
            </Section>

            <Section id="referral" title="친구 초대">
              <List items={[
                '좌측 사이드바의 {benefit} 메뉴 또는 모바일 프로필 {settings} 에서 초대 링크를 받을 수 있어요.',
                '친구가 링크로 가입하면 두 사람 모두 10크레딧을 받아요.',
                '누적 10명까지 초대 보너스를 받을 수 있어요.',
                '동일 IP·동일 OAuth 제공자 중복 사용은 어뷰징 방지를 위해 차단돼요.',
              ]} />
            </Section>

            <Section id="report" title="신고·문의">
              <List items={[
                '부적절한 곡·댓글은 {more} 메뉴의 {flag}로 사유와 함께 접수할 수 있어요. 신고 후 본인 화면에선 즉시 가려져요.',
                '계정 관련 문제나 기능 문의는 사이드바 더보기 {contact} 또는 bee202408@gmail.com로 메일 부탁드려요.',
                '회원 탈퇴는 프로필 수정 모달 하단의 **회원 탈퇴** 링크에서 진행할 수 있어요. 탈퇴 후 7일 이내 같은 계정으로 다시 로그인하면 자동으로 복원돼요.',
              ]} />
            </Section>
          </div>
        </article>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-6">
      <h2 className="text-xl md:text-2xl font-semibold text-white">{title}</h2>
      <div>{children}</div>
    </section>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-zinc-200 mt-4 mb-1">{children}</h3>
}

function TableRow({ badge, desc, credit }: { badge: string; desc: string; credit: string }) {
  return (
    <tr className="border-b border-white/[0.04] last:border-0">
      <td className="py-3 pr-4 align-top">
        <span dangerouslySetInnerHTML={{ __html: renderMd(badge) }} />
      </td>
      <td className="py-3 pr-4 align-top text-zinc-300 leading-relaxed">{desc}</td>
      <td className="py-3 text-right align-top text-white font-medium whitespace-nowrap">{credit}크레딧</td>
    </tr>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 list-disc list-outside pl-5 marker:text-zinc-500">
      {items.map((it, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: renderMd(it) }} />
      ))}
    </ul>
  )
}

// 본문에 실제 UI 아이콘을 인라인 렌더 — 발견성·기억 보조용 시범.
// 적용 토큰: {more}(⋮), {share}, {flag}, {publish}. 더 늘리면 노이즈 위험.
// 필터 톤은 본 앱 컨벤션과 동일 (회색 액션 = invert(0.55), 빨강 = sepia hue-rotate).
// 모델 버전 배지 (v2.0/v2.5+/v2.6) — 곡 카드와 동일 시각 스펙
const BADGE_GRAY   = 'display:inline-block;vertical-align:middle;margin:0 3px 2px;padding:2px 6px;border-radius:6px;background:#27272a;color:#a1a1aa;font-size:10px;font-weight:500;line-height:1;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.06)'
const BADGE_VIOLET = 'display:inline-block;vertical-align:middle;margin:0 3px 2px;padding:2px 6px;border-radius:6px;background:rgba(124,58,237,0.2);color:#c4b5fd;font-size:10px;font-weight:500;line-height:1'

// 액션 버튼 칩 — 아이콘 + 라벨을 하나의 박스로 감싸 본문 텍스트와 시각 분리.
// 본문 14px와 비교해 칩 13px로 살짝 작지만 패딩·라운드로 박스 인지 확보.
const BTN_GRAY  = 'display:inline-flex;align-items:center;gap:5px;vertical-align:middle;margin:0 4px 2px;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,0.08);color:#f4f4f5;font-size:13px;font-weight:500;line-height:1;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.10)'
const BTN_RED   = 'display:inline-flex;align-items:center;gap:5px;vertical-align:middle;margin:0 4px 2px;padding:5px 10px;border-radius:8px;background:rgba(239,68,68,0.15);color:#fca5a5;font-size:13px;font-weight:500;line-height:1;box-shadow:inset 0 0 0 1px rgba(239,68,68,0.30)'
const BTN_ICON     = 'width:13px;height:13px;filter:invert(0.85)'
const BTN_ICON_RED = 'width:13px;height:13px;filter:invert(0.65) sepia(1) saturate(5) hue-rotate(320deg)'

function renderMd(s: string): string {
  // 사이드바 ⚙ 아이콘은 별도 svg 파일 없어 inline 사용 (SelfSettingsMenu와 동일 path).
  const GEAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;display:inline-block;vertical-align:middle;color:rgba(244,244,245,0.85)"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`

  return s
    .replace(/\{more\}/g,     `<span style="${BTN_GRAY};padding:5px 9px"><img src="/More.svg" alt="" style="${BTN_ICON}" /></span>`)
    .replace(/\{settings\}/g, `<span style="${BTN_GRAY};padding:5px 9px">${GEAR_SVG}</span>`)
    .replace(/\{share\}/g,    `<span style="${BTN_GRAY}"><img src="/Share.svg" alt="" style="${BTN_ICON}" />공유</span>`)
    .replace(/\{publish\}/g,  `<span style="${BTN_GRAY}"><img src="/Publish.svg" alt="" style="${BTN_ICON}" />게시하기</span>`)
    .replace(/\{benefit\}/g,  `<span style="${BTN_GRAY}"><img src="/Gift-Card.svg" alt="" style="${BTN_ICON}" />혜택</span>`)
    .replace(/\{make\}/g,     `<span style="${BTN_GRAY}"><img src="/Ai-Generate-Music.svg" alt="" style="${BTN_ICON}" />음악 만들기</span>`)
    .replace(/\{contact\}/g,  `<span style="${BTN_GRAY}"><img src="/costumer.png" alt="" style="${BTN_ICON}" />문의하기</span>`)
    .replace(/\{flag\}/g,     `<span style="${BTN_RED}"><img src="/Flag.svg" alt="" style="${BTN_ICON_RED}" />신고</span>`)
    .replace(/\{v20\}/g,     `<span style="${BADGE_GRAY}">v2.0</span>`)
    .replace(/\{v25\}/g,     `<span style="${BADGE_GRAY}">v2.5+</span>`)
    .replace(/\{v26\}/g,     `<span style="${BADGE_VIOLET}">v2.6</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-medium">$1</strong>')
}
