import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '개인정보처리방침 — 모두의 노래',
}

export default function PrivacyPage() {
  return (
    <article className="space-y-8 text-zinc-300 leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">개인정보처리방침</h1>
        <p className="text-sm text-zinc-500">시행일: 2026년 5월 27일</p>
        <p className="text-sm text-zinc-400">
          주식회사 비누컴퍼니(이하 "회사")는 회원의 개인정보를 중요하게 생각하며,
          「개인정보 보호법」 등 관련 법령을 준수하기 위해 본 방침을 수립·공개합니다.
        </p>
      </header>

      <Section title="제1조 (수집하는 개인정보 항목)">
        <p className="mb-2">회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.</p>

        <SubSection title="필수 항목 (회원가입 시)">
          <List items={[
            '이메일 주소',
            'OAuth 식별자 (Google, Kakao, Naver, Apple이 제공하는 sub 또는 user id)',
            '아이디(username)',
            '가입 일시',
          ]} />
        </SubSection>

        <SubSection title="선택 항목 (회원이 직접 입력·업로드)">
          <List items={[
            '표시 이름(display name), 한 줄 소개(bio)',
            '프로필 사진(avatar), 커버 이미지',
            'SNS 링크(인스타그램·틱톡·유튜브·페이스북·X)',
            '커버 생성을 위해 회원이 업로드한 참조 음원 (AI 생성 입력용, 원본은 게시·배포되지 않음)',
          ]} />
        </SubSection>

        <SubSection title="서비스 이용 과정에서 자동 수집">
          <List items={[
            '회원이 생성한 곡(스타일 프롬프트, 가사, 오디오, 커버 이미지)',
            '곡 공개 여부, 좋아요, 컬렉션 담기, 재생 기록',
            '일일 크레딧 사용량, 마지막 리셋 시각',
            '접속 IP, 사용자 에이전트(User-Agent), 접속 일시(서비스 운영·보안·친구 초대 어뷰징 차단 목적)',
          ]} />
        </SubSection>

        <SubSection title="행동 분석 자동 수집 (Google Analytics 4)">
          <List items={[
            '페이지 방문 기록, 클릭·재생·게시 등 행동 이벤트',
            '디바이스 정보(브라우저·OS), 대략적 위치(국가 단위)',
            '익명 사용자 식별 쿠키 (`_ga`, `_ga_<id>`)',
            '로그인 회원의 경우 익명 UUID 형태의 user_id (이메일·실명 등 개인정보 미포함)',
          ]} />
          <p className="mt-2 text-xs text-zinc-400">
            수집 목적: 서비스 이용 패턴 분석, 기능 개선, 추천 알고리즘 최적화 · 보존 기간: 최대 14개월 (Google Analytics 정책) · 제3자 제공: Google LLC (Google Analytics 운영) · 거부 방법: <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="underline">Google Analytics Opt-out 브라우저 확장</a> 또는 광고 차단기 사용
          </p>
        </SubSection>

        <SubSection title="브라우저 캐시 (정적 콘텐츠)">
          <p className="text-sm text-zinc-300 leading-relaxed">
            음원·커버 이미지 등 정적 콘텐츠는 빠른 재생을 위해 표준 HTTP 캐시(Cache-Control) 헤더로 사용자 브라우저에 일정 기간 저장됩니다. 개인을 식별하거나 행동을 추적하지 않으며, 사용자는 언제든 브라우저 설정에서 캐시를 삭제하거나 차단할 수 있습니다.
          </p>
        </SubSection>
      </Section>

      <Section title="제2조 (개인정보의 수집·이용 목적)">
        <List items={[
          '회원 식별 및 가입·인증·계정 관리',
          '음악·이미지·가사 생성 및 결과 보관',
          '게시·공유·좋아요·컬렉션·재생 통계 등 서비스 기능 제공',
          '서비스 개선·신규 기능 개발·통계 분석',
          '부정 이용·어뷰징 탐지 및 대응',
          '법령 또는 약관 위반 대응',
        ]} />
      </Section>

      <Section title="제3조 (개인정보의 보유·이용 기간)">
        <List items={[
          '회원의 개인정보는 원칙적으로 회원 탈퇴 시까지 보유·이용합니다.',
          '회원이 탈퇴를 요청한 경우 지체 없이 파기합니다. 다만, 관련 법령에 따라 보존이 필요한 정보는 해당 기간 동안 별도 보관합니다.',
        ]} />
        <SubList items={[
          '계약·청약철회 등에 관한 기록: 5년 (전자상거래법)',
          '대금 결제·재화 공급에 관한 기록: 5년 (전자상거래법)',
          '소비자 불만·분쟁 처리에 관한 기록: 3년 (전자상거래법)',
          '서비스 부정 이용 기록: 1년 (정보통신망법)',
        ]} />
      </Section>

      <Section title="제4조 (개인정보의 제3자 제공)">
        <p>
          회사는 회원의 개인정보를 본 방침에 명시한 목적 외 용도로 사용하거나 제3자에게 제공하지 않습니다.
          다만, 법령에 의거하거나 수사기관의 요청이 있는 경우는 예외로 합니다.
        </p>
      </Section>

      <Section title="제5조 (개인정보 처리의 위탁)">
        <p className="mb-2">회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하고 있습니다.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-white/[0.08]">
            <thead className="bg-white/[0.04] text-zinc-400">
              <tr>
                <th className="text-left p-2 border-b border-white/[0.08]">수탁자</th>
                <th className="text-left p-2 border-b border-white/[0.08]">위탁 업무</th>
                <th className="text-left p-2 border-b border-white/[0.08]">저장 위치</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Supabase Inc.</td>
                <td className="p-2 border-b border-white/[0.06]">데이터베이스·파일 저장·인증</td>
                <td className="p-2 border-b border-white/[0.06]">AWS 미국</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Vercel Inc.</td>
                <td className="p-2 border-b border-white/[0.06]">서비스 호스팅 및 요청 처리</td>
                <td className="p-2 border-b border-white/[0.06]">미국</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">MiniMax AI</td>
                <td className="p-2 border-b border-white/[0.06]">AI 음악·이미지·가사 생성</td>
                <td className="p-2 border-b border-white/[0.06]">해외</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Google LLC</td>
                <td className="p-2 border-b border-white/[0.06]">OAuth 인증 위임</td>
                <td className="p-2 border-b border-white/[0.06]">해외</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Apple Inc.</td>
                <td className="p-2 border-b border-white/[0.06]">OAuth 인증 위임</td>
                <td className="p-2 border-b border-white/[0.06]">해외</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Kakao Corp.</td>
                <td className="p-2 border-b border-white/[0.06]">OAuth 인증 위임</td>
                <td className="p-2 border-b border-white/[0.06]">국내</td>
              </tr>
              <tr>
                <td className="p-2">Naver Corp.</td>
                <td className="p-2">OAuth 인증 위임</td>
                <td className="p-2">국내</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          위탁 계약 시 「개인정보 보호법」에 따라 처리 목적 외 이용 금지, 안전성 확보 조치 등을 명시하고 있습니다.
        </p>
      </Section>

      <Section title="제6조 (개인정보의 국외이전)">
        <p className="mb-2">
          회사는 서비스 제공을 위해 아래와 같이 회원의 개인정보를 국외로 이전합니다.
          「개인정보 보호법」 제28조의8에 따라 이를 공개합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-white/[0.08]">
            <thead className="bg-white/[0.04] text-zinc-400">
              <tr>
                <th className="text-left p-2 border-b border-white/[0.08]">이전받는 자</th>
                <th className="text-left p-2 border-b border-white/[0.08]">국가</th>
                <th className="text-left p-2 border-b border-white/[0.08]">이전 목적</th>
                <th className="text-left p-2 border-b border-white/[0.08]">이전 항목</th>
                <th className="text-left p-2 border-b border-white/[0.08]">보유·이용 기간</th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Supabase Inc.</td>
                <td className="p-2 border-b border-white/[0.06]">미국</td>
                <td className="p-2 border-b border-white/[0.06]">회원 인증 및 계정·콘텐츠 데이터 저장</td>
                <td className="p-2 border-b border-white/[0.06]">이름, 이메일, 생성 콘텐츠</td>
                <td className="p-2 border-b border-white/[0.06]">회원 탈퇴 시까지</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Vercel Inc.</td>
                <td className="p-2 border-b border-white/[0.06]">미국</td>
                <td className="p-2 border-b border-white/[0.06]">서비스 호스팅 및 요청 처리</td>
                <td className="p-2 border-b border-white/[0.06]">이름, 이메일</td>
                <td className="p-2 border-b border-white/[0.06]">요청 처리 과정에서 일시 처리 (영구 저장 안 함)</td>
              </tr>
              <tr>
                <td className="p-2">MiniMax</td>
                <td className="p-2">해외</td>
                <td className="p-2">AI 음악·이미지·가사 생성</td>
                <td className="p-2">회원이 입력한 생성 텍스트(스타일·가사), 참조 음원</td>
                <td className="p-2">생성 처리 목적 달성 시까지</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          회원은 국외이전에 동의하지 않을 권리가 있으나, 동의하지 않을 경우 서비스 이용이 제한될 수 있습니다.
        </p>
      </Section>

      <Section title="제7조 (이용자의 권리와 행사 방법)">
        <List items={[
          '회원은 언제든지 자신의 개인정보 열람·정정·삭제·처리 정지를 요청할 수 있습니다.',
          '대부분의 권리는 프로필 화면에서 직접 수행할 수 있으며, 그 외 사항은 아래 연락처로 요청하실 수 있습니다.',
          '회원의 동의 철회 또는 탈퇴 요청은 지체 없이 처리됩니다.',
          '만 14세 미만은 본 서비스에 가입할 수 없으므로 별도의 법정대리인 동의 절차는 두지 않습니다.',
        ]} />
      </Section>

      <Section title="제8조 (개인정보의 파기 절차·방법)">
        <List items={[
          '보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.',
          '전자적 파일 형태: 복구·재생할 수 없도록 영구 삭제합니다.',
          '종이 문서: 분쇄하거나 소각합니다.',
        ]} />
      </Section>

      <Section title="제9조 (개인정보의 안전성 확보 조치)">
        <List items={[
          'HTTPS를 통한 통신 구간 암호화',
          'Supabase Row Level Security(RLS)로 사용자별 데이터 접근 제어',
          '비밀번호는 자체 저장하지 않고 OAuth 제공자(Google·Kakao·Naver·Apple)에 위임',
          '관리자 접근 권한 최소화 및 접근 기록 보관',
        ]} />
      </Section>

      <Section title="제10조 (개인정보 보호책임자)">
        <p>
          회사는 이용자의 개인정보가 훼손되거나 침해되지 않도록 최선을 다하고 있으며, 아래와 같이 개인정보의 처리에 관한 업무를 총괄하여 책임질 개인정보 보호책임자 및 개인정보 보호 관련 고충사항과 개인정보 열람청구를 접수·처리하는 담당부서를 두고 있습니다. 다만, 회사는 법률상 요구되는 기술적·물리적·관리적 조치를 다하였음에도 불구하고, 이용자 본인의 부주의나 회사가 관리하지 않는 영역에서의 사고 등 회사의 귀책에 기인하지 않은 손해에 대해서는 책임을 지지 않습니다.
        </p>
        <div className="mt-3 p-4 rounded-lg border border-white/[0.08] bg-white/[0.03] text-sm space-y-1">
          <p className="text-zinc-200 font-medium mb-1">개인정보 보호책임자</p>
          <p><span className="text-zinc-500">성명</span> &nbsp; 박진왕</p>
          <p><span className="text-zinc-500">직위</span> &nbsp; 과장</p>
          <p><span className="text-zinc-500">연락처</span> &nbsp; <a href="mailto:bee202408@gmail.com" className="text-violet-400 hover:text-violet-300 transition-colors">bee202408@gmail.com</a></p>
        </div>
        <div className="mt-3 p-4 rounded-lg border border-white/[0.08] bg-white/[0.03] text-sm space-y-1">
          <p className="text-zinc-200 font-medium mb-1">개인정보보호 담당부서</p>
          <p><span className="text-zinc-500">부서명</span> &nbsp; AX팀</p>
          <p><span className="text-zinc-500">연락처</span> &nbsp; <a href="mailto:bee202408@gmail.com" className="text-violet-400 hover:text-violet-300 transition-colors">bee202408@gmail.com</a></p>
        </div>
      </Section>

      <Section title="제11조 (권익침해 구제방법)">
        <p>개인정보 침해에 대한 신고나 상담이 필요한 경우 아래 기관에 문의하실 수 있습니다.</p>
        <List items={[
          '개인정보분쟁조정위원회: www.kopico.go.kr (국번없이 1833-6972)',
          '개인정보침해신고센터: privacy.kisa.or.kr (국번없이 118)',
          '대검찰청 사이버수사과: www.spo.go.kr (국번없이 1301)',
          '경찰청 사이버수사국: ecrm.police.go.kr (국번없이 182)',
        ]} />
        <p className="mt-3">
          개인정보 보호법 제35조(열람), 제36조(정정·삭제), 제37조(처리정지) 등의 규정에 의한 요구에 대하여 공공기관의 장이 행한 처분 또는 부작위로 권리 또는 이익을 침해받은 경우, 행정심판법이 정하는 바에 따라 행정심판을 청구할 수 있습니다. (중앙행정심판위원회: www.simpan.go.kr, 국번없이 110)
        </p>
      </Section>

      <Section title="제12조 (개인정보처리방침의 변경)">
        <List items={[
          '본 방침은 법령·정책 또는 보안 기술의 변경에 따라 내용이 추가·삭제·수정될 수 있습니다.',
          '변경이 있을 경우 변경 사유와 시행일을 명시하여 시행일 7일 이전(중대한 변경은 30일 이전)에 서비스 내에 공지합니다.',
        ]} />
      </Section>

      <p className="text-xs text-zinc-500 pt-4 border-t border-white/[0.06]">
        본 방침은 2026년 5월 27일부터 시행됩니다.
      </p>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="text-sm">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="text-sm font-medium text-zinc-200 mb-1.5">▸ {title}</p>
      {children}
    </div>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal pl-5 space-y-1.5 marker:text-zinc-500">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ol>
  )
}

function SubList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-9 mt-2 space-y-1 marker:text-zinc-600 text-zinc-400">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}
