import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '개인정보처리방침 — 모두의 노래',
}

export default function PrivacyPage() {
  return (
    <article className="space-y-8 text-zinc-300 leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">개인정보처리방침</h1>
        <p className="text-sm text-zinc-500">시행일: 2026년 5월 22일</p>
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
            'OAuth 식별자 (Google, Kakao가 제공하는 sub 또는 user id)',
            '아이디(username)',
            '가입 일시',
          ]} />
        </SubSection>

        <SubSection title="선택 항목 (회원이 직접 입력·업로드)">
          <List items={[
            '표시 이름(display name), 한 줄 소개(bio)',
            '프로필 사진(avatar), 커버 이미지',
            'SNS 링크(인스타그램·틱톡·유튜브·페이스북·X)',
          ]} />
        </SubSection>

        <SubSection title="서비스 이용 과정에서 자동 수집">
          <List items={[
            '회원이 생성한 곡(스타일 프롬프트, 가사, 오디오, 커버 이미지)',
            '곡 공개 여부, 좋아요, 컬렉션 담기, 재생 기록',
            '일일 크레딧 사용량, 마지막 리셋 시각',
            '접속 IP, 사용자 에이전트(User-Agent), 접속 일시(서비스 운영·보안 목적)',
          ]} />
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
                <td className="p-2 border-b border-white/[0.06]">Supabase</td>
                <td className="p-2 border-b border-white/[0.06]">데이터베이스·파일 저장·인증</td>
                <td className="p-2 border-b border-white/[0.06]">AWS (해외)</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">MiniMax</td>
                <td className="p-2 border-b border-white/[0.06]">AI 음악·이미지·가사 생성</td>
                <td className="p-2 border-b border-white/[0.06]">해외</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">Google LLC</td>
                <td className="p-2 border-b border-white/[0.06]">OAuth 인증 위임</td>
                <td className="p-2 border-b border-white/[0.06]">해외</td>
              </tr>
              <tr>
                <td className="p-2">Kakao Corp.</td>
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

      <Section title="제6조 (이용자의 권리와 행사 방법)">
        <List items={[
          '회원은 언제든지 자신의 개인정보 열람·정정·삭제·처리 정지를 요청할 수 있습니다.',
          '대부분의 권리는 프로필 화면에서 직접 수행할 수 있으며, 그 외 사항은 아래 연락처로 요청하실 수 있습니다.',
          '회원의 동의 철회 또는 탈퇴 요청은 지체 없이 처리됩니다.',
          '만 14세 미만은 본 서비스에 가입할 수 없으므로 별도의 법정대리인 동의 절차는 두지 않습니다.',
        ]} />
      </Section>

      <Section title="제7조 (개인정보의 파기 절차·방법)">
        <List items={[
          '보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.',
          '전자적 파일 형태: 복구·재생할 수 없도록 영구 삭제합니다.',
          '종이 문서: 분쇄하거나 소각합니다.',
        ]} />
      </Section>

      <Section title="제8조 (개인정보의 안전성 확보 조치)">
        <List items={[
          'HTTPS를 통한 통신 구간 암호화',
          'Supabase Row Level Security(RLS)로 사용자별 데이터 접근 제어',
          '비밀번호는 자체 저장하지 않고 OAuth 제공자(Google·Kakao)에 위임',
          '관리자 접근 권한 최소화 및 접근 기록 보관',
        ]} />
      </Section>

      <Section title="제9조 (개인정보 보호 책임자)">
        <p>
          회사는 회원의 개인정보를 보호하고 관련 불만을 처리하기 위해 다음과 같이 책임자를 지정하고 있습니다.
        </p>
        <div className="mt-3 p-4 rounded-lg border border-white/[0.08] bg-white/[0.03] text-sm space-y-1">
          <p><span className="text-zinc-500">소속</span> &nbsp; 주식회사 비누컴퍼니</p>
          <p><span className="text-zinc-500">이메일</span> &nbsp; (책임자 이메일 — 추후 공지)</p>
        </div>
      </Section>

      <Section title="제10조 (개인정보처리방침의 변경)">
        <List items={[
          '본 방침은 법령·정책 또는 보안 기술의 변경에 따라 내용이 추가·삭제·수정될 수 있습니다.',
          '변경이 있을 경우 변경 사유와 시행일을 명시하여 시행일 7일 이전(중대한 변경은 30일 이전)에 서비스 내에 공지합니다.',
        ]} />
      </Section>

      <p className="text-xs text-zinc-500 pt-4 border-t border-white/[0.06]">
        본 방침은 2026년 5월 22일부터 시행됩니다.
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
