import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '이용약관 — 모두의 노래',
}

export default function TermsPage() {
  return (
    <article className="space-y-8 text-zinc-300 leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">이용약관</h1>
        <p className="text-sm text-zinc-500">시행일: 2026년 5월 27일</p>
      </header>

      <Section title="제1조 (목적)">
        <p>
          이 약관은 주식회사 비누컴퍼니(이하 "회사")가 제공하는 "모두의 노래"(이하 "서비스")의 이용과 관련하여 회사와 이용자의
          권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
        </p>
      </Section>

      <Section title="제2조 (정의)">
        <List items={[
          '"서비스"란 회사가 AI 기반으로 음악·가사·커버 이미지를 생성하고 공유할 수 있도록 제공하는 일체의 서비스를 말합니다.',
          '"회원"이란 본 약관에 동의하고 회사가 정한 절차에 따라 가입하여 서비스를 이용하는 자를 말합니다.',
          '"콘텐츠"란 회원이 서비스를 통해 생성·게시한 음원·가사·이미지·텍스트·프로필 정보 등 일체의 자료를 말합니다.',
          '"크레딧"이란 음악 생성에 사용되는 가상 단위로, 회원에게 일정량이 무상 또는 유상으로 제공됩니다.',
        ]} />
      </Section>

      <Section title="제3조 (약관의 효력 및 변경)">
        <List items={[
          '본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.',
          '회사는 관련 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경 시 변경 사유와 시행일을 명시하여 시행일 7일 이전(회원에게 불리한 변경은 30일 이전)에 서비스 내에 공지합니다.',
          '회원이 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 회원 탈퇴를 요청할 수 있습니다.',
        ]} />
      </Section>

      <Section title="제4조 (회원가입)">
        <List items={[
          '서비스는 만 14세 이상만 가입할 수 있습니다. 만 14세 미만은 회원가입이 제한됩니다.',
          '회원가입은 Google, Kakao, Naver 등 외부 인증 서비스(OAuth)를 통해 진행됩니다.',
          '회사는 다음 각 호에 해당하는 신청에 대해 가입을 거절하거나 사후 해지할 수 있습니다.',
        ]} />
        <SubList items={[
          '타인의 명의나 정보를 도용한 경우',
          '허위 정보를 기재한 경우',
          '서비스 운영을 방해하거나 부정 이용한 이력이 있는 경우',
        ]} />
      </Section>

      <Section title="제5조 (회원 정보 변경)">
        <List items={[
          '회원은 프로필 화면에서 이름·아이디·소개·SNS 링크 등 정보를 수정할 수 있습니다.',
          '아이디는 평생 1회만 변경할 수 있습니다. 신중히 결정해 주시기 바랍니다.',
          '이름(표시 이름)은 14일 이내 최대 2회까지 변경할 수 있습니다.',
        ]} />
      </Section>

      <Section title="제6조 (서비스 이용)">
        <List items={[
          '회사는 회원에게 무료 크레딧을 일정량 제공합니다(현재 일 10크레딧, 자정 KST 기준 리셋, 이월 불가).',
          '일부 모델·기능은 향후 출시될 유료 플랜에서 제공될 수 있으며, 사전에 안내합니다.',
          '회사는 안정적인 서비스 제공을 위해 시스템 점검·업데이트·외부 장애 시 서비스를 일시 중단할 수 있습니다.',
        ]} />
      </Section>

      <Section title="제7조 (콘텐츠의 권리)">
        <List items={[
          '회원이 서비스를 통해 생성한 콘텐츠의 저작권은 해당 회원에게 귀속됩니다.',
          '단, 회원은 회사가 서비스 운영·홍보·기능 개선·통계·기술 연구를 위해 회원의 콘텐츠를 비독점적·전 세계적·무상으로 사용할 수 있는 권한(이용권)을 회사에 부여합니다.',
          '회원이 서비스를 탈퇴하더라도 이미 회사가 위 목적으로 이용 중인 부분에 대해서는 합리적인 기간 동안 이용권이 유지됩니다.',
          '생성 결과물의 외부 사용에 대한 상업적 이용 가능 여부는 향후 유료 플랜 정책 및 기반 AI 모델 제공자(MiniMax 등)의 정책을 따릅니다.',
        ]} />
      </Section>

      <Section title="제8조 (금지 행위)">
        <p className="mb-2">회원은 다음 각 호의 행위를 해서는 안 됩니다.</p>
        <List items={[
          '타인의 저작권·초상권·상표권 등을 침해하는 콘텐츠를 생성·게시하는 행위',
          '음란·폭력·차별·혐오·범죄 등 사회 통념상 부적절한 콘텐츠를 생성·게시하는 행위',
          '타인의 명예를 훼손하거나 사생활을 침해하는 행위',
          '자동화된 수단으로 서비스에 접속하거나 비정상적인 트래픽을 발생시키는 행위',
          '서비스의 보안·운영을 방해하거나 취약점을 악용하는 행위',
          '회사·타인을 사칭하거나 허위 정보를 유포하는 행위',
        ]} />
      </Section>

      <Section title="제9조 (게시물 관리)">
        <List items={[
          '회사는 회원의 게시물이 본 약관 또는 관련 법령을 위반하는 경우 사전 통지 없이 삭제·비공개·접근 제한 등 필요한 조치를 취할 수 있습니다.',
          '회원은 자신이 게시한 콘텐츠를 언제든 삭제할 수 있으며, 삭제 시점부터 일정 기간(예: 5초) 안에는 복원이 가능합니다.',
        ]} />
      </Section>

      <Section title="제10조 (책임 제한)">
        <List items={[
          'AI를 통해 생성된 결과물은 무작위성과 불완전성을 가지며, 회사는 그 정확성·적합성·법적 안전성을 보장하지 않습니다.',
          '외부 서비스(Supabase, MiniMax 등)의 장애·정책 변경으로 인해 발생하는 불가피한 손해에 대해 회사는 책임을 지지 않습니다.',
          '회사는 천재지변, 전쟁, 정부 조치 등 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임을 지지 않습니다.',
        ]} />
      </Section>

      <Section title="제11조 (분쟁 해결)">
        <List items={[
          '본 약관은 대한민국 법령에 따라 해석됩니다.',
          '회사와 회원 간 발생한 분쟁은 우선 상호 협의를 통해 해결하며, 협의가 이루어지지 않을 경우 서울중앙지방법원을 제1심 관할 법원으로 합니다.',
        ]} />
      </Section>

      <Section title="제12조 (부칙)">
        <p>본 약관은 2026년 5월 27일부터 시행됩니다.</p>
      </Section>
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
