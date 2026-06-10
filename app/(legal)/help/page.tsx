// 도움말 페이지 — 간단 사용법.
// 좌측 TOC + 우측 본문, 같은 페이지 내 스크롤 이동.
// 모바일: TOC 위 / 본문 아래 단일 컬럼.

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
    <article className="max-w-[1100px] mx-auto px-5 md:px-8 py-10 md:py-14">
      <header className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">도움말</h1>
        <p className="text-zinc-400 text-sm md:text-base">모두의 노래(MONO)를 처음 시작하시는 분들을 위한 간단한 안내예요.</p>
      </header>

      <div className="md:flex md:gap-10">
        {/* 좌측 TOC — 데스크톱 sticky, 모바일 상단 인라인 */}
        <aside className="md:w-52 md:shrink-0 mb-8 md:mb-0">
          <nav className="md:sticky md:top-6">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3 font-semibold">목차</p>
            <ul className="space-y-1">
              {TOC.map(({ id, label }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* 본문 — 단일 페이지 스크롤 */}
        <div className="flex-1 min-w-0 space-y-12 text-sm md:text-base leading-relaxed text-zinc-300 [scroll-margin-top:1.5rem] [&_section]:scroll-mt-6">
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
            <p>
              <strong className="text-white">음악 만들기</strong> 페이지에서 <strong className="text-white">심플</strong>과 <strong className="text-white">고급</strong> 두 모드를 선택할 수 있어요.
            </p>
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
              '"커버" 모델로 좋아하는 곡의 분위기를 참고해 만들 수도 있어요 (Music 2.6).',
            ]} />
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
            <p>
              만든 곡은 두 가지 방식으로 공유할 수 있어요.
            </p>
            <SubTitle>비공개 공유 (링크)</SubTitle>
            <List items={[
              '곡 상세 페이지의 **공유** 버튼으로 링크를 받아 친구에게 보낼 수 있어요.',
              '게시하지 않아도 링크를 받은 사람은 들을 수 있어요.',
              '둘러보기·검색·프로필에는 노출되지 않아요.',
            ]} />
            <SubTitle>공개 게시</SubTitle>
            <List items={[
              '⋮ 메뉴의 **게시하기**를 누르면 둘러보기·검색·내 프로필에 공개돼요.',
              '게시 시 공개용 커버 이미지와 한 줄 코멘트를 따로 지정할 수 있어요.',
              '언제든 **게시 취소**로 비공개로 되돌릴 수 있어요.',
            ]} />
          </Section>

          <Section id="credits" title="크레딧">
            <List items={[
              '일일 크레딧 10cr은 매일 KST 자정에 자동 충전되며 이월되지 않아요.',
              '친구 초대로 받은 보너스 크레딧은 영구 보관되고, 곡 생성 시 보너스가 먼저 사용돼요.',
              '곡 생성 실패 시 크레딧은 자동으로 환불돼요.',
              '관리자 계정은 일일 100크레딧이 부여돼요.',
            ]} />
          </Section>

          <Section id="referral" title="친구 초대">
            <List items={[
              '좌측 사이드바의 **혜택** 메뉴 또는 모바일 프로필 ⚙ 에서 초대 링크를 받을 수 있어요.',
              '친구가 링크로 가입하면 두 사람 모두 10크레딧을 받아요.',
              '누적 10명까지 초대 보너스를 받을 수 있어요.',
              '동일 IP·동일 OAuth 제공자 중복 사용은 어뷰징 방지를 위해 차단돼요.',
            ]} />
          </Section>

          <Section id="report" title="신고·문의">
            <List items={[
              '부적절한 곡·댓글은 ⋮ 메뉴의 **신고**로 사유와 함께 접수할 수 있어요. 신고 후 본인 화면에선 즉시 가려져요.',
              '계정 관련 문제나 기능 문의는 사이드바 더보기 **문의하기** 또는 bee202408@gmail.com로 메일 부탁드려요.',
              '회원 탈퇴는 프로필 수정 모달 하단의 **회원 탈퇴** 링크에서 진행할 수 있어요. 탈퇴 후 7일 이내 같은 계정으로 다시 로그인하면 자동으로 복원돼요.',
            ]} />
          </Section>
        </div>
      </div>
    </article>
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

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 list-disc list-outside pl-5 marker:text-zinc-500">
      {items.map((it, i) => (
        <li key={i} dangerouslySetInnerHTML={{ __html: renderMd(it) }} />
      ))}
    </ul>
  )
}

// `**bold**` 만 변환 — markdown-lite. dangerouslySetInnerHTML 사용처 한정.
function renderMd(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-medium">$1</strong>')
}
