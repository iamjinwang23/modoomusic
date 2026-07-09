import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '운영정책 — 모두의 노래',
}

export default function PolicyPage() {
  return (
    <article className="space-y-8 text-zinc-300 leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-white">운영정책</h1>
        <p className="text-sm text-zinc-500">시행일: 2026년 6월 10일 · 개정: 2026년 7월 1일 (커뮤니티 운영 정책·금지행위 신설)</p>
      </header>

      <p className="text-sm">
        모두의 노래(MONO)는 AI로 누구나 쉽게 노래를 만들고, 자신의 창작물을 공유하며 함께 소통할 수 있는 음악 플랫폼입니다.
        회사는 모든 이용자가 즐겁고 쾌적한 환경에서 서비스를 이용할 수 있도록 본 운영정책을 마련하였습니다.
        서비스 이용에 제한이나 불이익이 발생하지 않도록 반드시 본 운영정책을 확인해 주시기 바랍니다.
      </p>

      <Section title="제1조 (운영정책 개요)">
        <List items={[
          '주식회사 비누컴퍼니(이하 "회사")는 원활한 서비스 제공과 이용자 보호를 위하여 본 운영정책을 수립·운영합니다.',
          '본 운영정책은 서비스 이용 과정에서 발생할 수 있는 각종 문제를 신속하고 일관되게 처리하기 위한 기준을 포함합니다.',
          '회사는 안정적인 서비스 운영을 위해 운영정책을 변경할 수 있으며, 변경 시 앱 내 공지 또는 공식 홈페이지 등의 채널을 통해 사전 안내합니다.',
          '본 운영정책에서 정하지 않은 사항은 「모두의 노래 서비스 이용약관」, 「개인정보 처리방침」 및 관련 법령을 따릅니다.',
        ]} />
      </Section>

      <Section title="제2조 (적용 대상)">
        <p className="mb-2">본 운영정책은 아래 서비스 요소 전반에 적용됩니다.</p>
        <Bullets items={[
          '곡 게시물(생성된 음원, 커버 이미지, 제목, 가사, 코멘트 등 포함)',
          '이용자 프로필(아이디, 표시 이름, 프로필·커버 이미지, 소개글, SNS 링크 등)',
          '좋아요·컬렉션·팔로우 등 소셜 활동',
          '참조 음원 업로드 등 곡 생성 과정에서 제출하는 자료',
          '크레딧(일일 무료 크레딧)의 지급·사용 및 관련 기능 전반',
        ]} />
      </Section>

      <Section title="제3조 (크레딧 운영 정책)">
        <List items={[
          '회사는 1차 무료 정책에 따라 모든 회원에게 곡 생성 등에 사용할 수 있는 일일 무료 크레딧을 지급합니다.',
          '크레딧의 지급량, 리셋 시점, 모델별 차감 기준 등 구체적인 사항은 서비스 화면 또는 공지사항을 통해 안내하며, 회사 정책에 따라 변경될 수 있습니다. (현재: 매일 일정량의 무료 크레딧 지급, 매일 자정(KST) 기준 리셋, 미사용 크레딧 이월 없음)',
          '크레딧은 서비스 내 기능 이용을 위한 수단이며, 현금 또는 이에 준하는 지급수단이 아닙니다. 무상으로 제공되는 크레딧은 현금 환불·환전되지 않으며, 회사가 명시적으로 허용한 경우를 제외하고 제3자에게 양도·대여·판매할 수 없습니다.',
          '회사는 부정 이용·비정상적 취득, 시스템 오류로 인한 과오 지급, 운영정책 또는 관련 법령 위반 등의 사유가 있는 경우 지급된 크레딧의 전부 또는 일부를 회수하거나 사용을 제한할 수 있습니다.',
          '회사는 서비스의 건전한 운영을 위하여 필요한 경우, 크레딧 사용 및 곡 생성에 대해 횟수·한도·조건을 설정하거나 본인확인 절차를 요구할 수 있습니다. (현재: 일일 크레딧 한도, 모델별 차감, 일부 기능의 연속 사용 제한 적용)',
        ]} />
        <p className="text-xs text-zinc-500 mt-3">
          ※ 유료 플랜 및 혜택(리워드) 서비스는 추후 도입될 수 있으며, 도입 시 관련 기준을 본 운영정책에 추가하고 사전 안내합니다.
        </p>
      </Section>

      <Section title="제4조 (금지 행위 및 제재 기준)">
        <div className="space-y-5">
          <Ban
            title="① 비정상적인 계정 생성 및 사용"
            items={[
              '타인의 개인정보(가족, 지인 등)를 이용하여 계정을 생성하는 행위',
              '가상 번호, 허위 정보 등을 이용하여 계정을 생성하는 행위',
              '동일 사용자가 다수의 계정을 생성하여 서비스 혜택(크레딧 등)을 중복 수령하는 행위',
              '회사 또는 운영진을 사칭하거나, 타인을 사칭하여 혼란이나 피해를 유발하는 행위',
            ]}
            penalty="1회 경고 후 반복 시 계정 영구 제한"
          />
          <Ban
            title="② 저작권 등 타인의 권리 침해"
            items={[
              '회사 또는 정당한 권리자로부터 이용 권한을 부여받지 않은 음원·가사·이미지 등을 참조 음원으로 업로드하거나, 이를 포함한 콘텐츠를 생성·게시하는 행위',
              '타인의 저작물·초상·상표 등 권리를 침해하는 콘텐츠를 게시하는 행위',
            ]}
            note="생성된 곡의 저작권 및 이용 권한은 이용약관에서 정한 바에 따릅니다."
            penalty="적발 즉시 해당 콘텐츠 삭제 및 1회 경고, 반복 시 계정 영구 제한"
          />
          <Ban
            title="③ 부적절한 콘텐츠 게시 (유해 콘텐츠)"
            lead="가사, 제목, 프롬프트, 커버 이미지, 코멘트 등에 다음이 포함되는 경우:"
            items={[
              '욕설, 비속어, 모욕적 표현',
              '음란성·선정적인 표현 또는 이미지',
              '혐오·차별·폭력을 조장하는 표현',
              '도박, 사행성 행위를 유도하는 내용',
              '그 밖에 타인에게 불쾌감을 주거나 법령에 위반되는 내용',
            ]}
            penalty="적발 즉시 콘텐츠 삭제 및 1회 경고, 반복 시 계정 영구 제한"
          />
          <Ban
            title="④ 크레딧·서비스 부정 이용 및 어뷰징"
            items={[
              '동일 이용자가 다수의 계정을 이용해 크레딧 등 혜택을 중복 수령하는 행위',
              '동일 기기 또는 유사한 환경에서 반복적으로 혜택을 획득하려는 행위',
              '자동화 프로그램(매크로, 봇 등)을 이용해 곡 생성·크레딧 사용을 시도하는 행위',
              '정상적인 서비스 이용 목적이 아닌 방식으로 크레딧·기능을 악용하는 행위',
            ]}
            penalty="부정 획득 혜택 회수 및 1회 경고, 반복 또는 고의성이 확인될 경우 계정 영구 제한"
          />
          <Ban
            title="⑤ 타인의 명예 훼손 및 허위 정보 유포"
            items={[
              '회사 및 타인에 대한 허위 사실, 루머 게시 및 유포',
              '욕설, 협박, 악의적 비방, 스토킹 등의 행위',
              '특정 집단에 대한 차별적 표현 사용',
              '개인정보 노출을 통해 금전적 이득을 취하려는 행위',
            ]}
            penalty="1회 경고 및 콘텐츠 삭제, 반복 시 계정 영구 제한"
          />
          <Ban
            title="⑥ 비정상적인 시스템 조작"
            items={[
              '재생수, 좋아요 등을 인위적으로 증가시키는 행위',
              '자동화 프로그램(매크로, 봇 등), 외부 툴 등을 이용한 비정상적인 활동',
            ]}
            penalty="1회 적발 시 콘텐츠 삭제 및 경고, 반복 시 계정 영구 제한"
          />
          <Ban
            title="⑦ 무분별한 신고 및 허위 신고"
            items={[
              '명확한 사유 없이 반복적으로 신고하는 행위',
              '특정 이용자를 대상으로 악의적인 신고를 지속하는 행위',
            ]}
            penalty="허위 신고 3회 누적 시 계정 사용 영구 제한"
          />
          <Ban
            title="⑧ 커뮤니티 악용 및 관리 권한 남용"
            items={[
              '홍보·도배 목적 등으로 커뮤니티를 무분별하게 개설하거나 운영하는 행위',
              '매니저 권한(강퇴·게시글 삭제·고정 등)을 부당하거나 차별적으로 남용하는 행위',
              '커뮤니티를 불법·유해 정보의 유통 창구로 이용하는 행위',
            ]}
            penalty="사안에 따라 게시물·커뮤니티 삭제, 경고, 이용 제한"
          />
        </div>
      </Section>

      <Section title="제5조 (신고 정책)">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-white">① 검토 및 임시조치 (공통 원칙)</h3>
            <p>
              회사는 신고 또는 모니터링 결과에 따라 관리자 검토를 거쳐 조치를 결정하며, 필요 시 임시조치(콘텐츠 숨김, 일부 기능 제한 등)를
              할 수 있습니다. 다만 최종 제재가 확정되는 경우, 회사는 이용약관에 따라 7일 이내에 제재 사유·내용·기간 및 이의신청 방법을 통지합니다.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">② 신고 대상</h3>
            <Bullets items={['게시물(공개된 곡)', '커뮤니티 게시글·댓글', '이용자 프로필']} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">③ 신고 처리 원칙</h3>
            <Bullets items={[
              '로그인한 이용자에 한해 신고가 가능합니다.',
              '신고 사유는 1개 항목만 선택할 수 있습니다.',
              '신고 완료 시, 신고한 이용자 기준으로 해당 콘텐츠는 즉시 숨김 처리되며, 다른 이용자에게는 기존과 동일하게 노출됩니다.',
              '전체 이용자 대상 노출 여부 및 삭제 조치는 관리자 검토 후 결정됩니다.',
            ]} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">④ 신고 사유 항목</h3>
            <Bullets items={[
              '욕설·비속어', '음란물', '혐오·차별 표현', '도배',
              '광고·홍보성 콘텐츠', '개인정보 노출', '저작권 침해', '기타 부적절한 콘텐츠 또는 행위',
            ]} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">⑤ 신고 관리 및 제재</h3>
            <Bullets items={[
              '관리자는 관리자 도구 또는 고객센터를 통해 신고 내역을 확인합니다.',
              '신고 누적 횟수가 내부 기준을 초과할 경우, 관리자 검토 후 전체 비노출 또는 삭제 조치가 이루어질 수 있습니다.',
            ]} />
          </div>
        </div>
      </Section>

      <Section title="제5조의2 (커뮤니티 운영 정책)">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-white">① 개설 및 매니저</h3>
            <Bullets items={[
              '커뮤니티는 서비스가 정한 범위에서 개설할 수 있으며, 개설자는 해당 커뮤니티의 매니저가 됩니다.',
              '매니저는 자신의 커뮤니티를 관련 법령·이용약관·본 운영정책에 따라 운영할 의무가 있습니다.',
            ]} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">② 매니저의 관리 권한</h3>
            <Bullets items={[
              '게시글 상단 고정·삭제, 커뮤니티 정보(이름·소개·이미지) 수정, 회원 강제 탈퇴(강퇴), 커뮤니티 폐쇄',
              '권한은 해당 커뮤니티 내로 한정되며, 부당·차별적 남용은 제4조에 따라 제재될 수 있습니다.',
            ]} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">③ 조치 통지 및 이의</h3>
            <Bullets items={[
              '강퇴·게시글 삭제 등 회원에게 불이익이 되는 조치가 있는 경우, 해당 회원에게 알림으로 통지됩니다.',
              '조치에 이의가 있는 회원은 제6조(이의 신청 절차)에 따라 고객센터로 이의를 제기할 수 있습니다.',
            ]} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">④ 폐쇄 시 데이터</h3>
            <Bullets items={[
              '커뮤니티가 폐쇄되면 해당 커뮤니티의 게시글·댓글·멤버십 등은 삭제되며 복구되지 않습니다. 첨부된 곡 등 개별 콘텐츠 자체는 삭제되지 않을 수 있습니다.',
            ]} />
          </div>
        </div>
      </Section>

      <Section title="제6조 (이의 신청 절차)">
        <List items={[
          '이용 제한 또는 제재 조치에 대해 이의가 있는 경우, 조치를 통지받은 날로부터 30일 이내 고객센터를 통해 이의 신청할 수 있습니다.',
          '이의 신청 시 이의 신청자의 아이디(또는 표시 이름), 제재된 콘텐츠 정보, 이의 신청 사유 및 관련 증빙 자료를 포함해야 합니다.',
          '회사는 이의 신청 접수일로부터 15일 이내 검토 결과를 회신합니다.',
        ]} />
        <p className="text-sm mt-3">
          고객센터 문의: <a href="mailto:bee202408@gmail.com" className="text-violet-400 hover:text-violet-300 transition-colors">bee202408@gmail.com</a>
        </p>
      </Section>

      <Section title="제7조 (회원 탈퇴 시 데이터 처리)">
        <p className="mb-3">
          회원이 탈퇴를 요청하면 회사는 관련 법령 및 「개인정보 처리방침」에 따라 다음 기준으로 데이터를 처리합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-white/[0.08] rounded">
            <thead>
              <tr className="bg-white/[0.04]">
                <th className="text-left p-2 border-b border-white/[0.08] w-[40%]">데이터 종류</th>
                <th className="text-left p-2 border-b border-white/[0.08]">처리 방식</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">개인 식별 정보 (이메일·이름·아바타·OAuth 식별자)</td>
                <td className="p-2 border-b border-white/[0.06]">즉시 파기</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">공개한 곡</td>
                <td className="p-2 border-b border-white/[0.06]">작성자 표시를 "(탈퇴한 회원)"으로 익명화 후 서비스 내 유지</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">비공개 곡</td>
                <td className="p-2 border-b border-white/[0.06]">즉시 파기</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">본인이 작성한 댓글·답글</td>
                <td className="p-2 border-b border-white/[0.06]">작성자 표시를 "(탈퇴한 회원)"으로 익명화 후 유지 (대화 맥락 보존)</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">커뮤니티 게시글·댓글 및 개설한 커뮤니티</td>
                <td className="p-2 border-b border-white/[0.06]">작성자·매니저 표시를 익명화하여 유지될 수 있으며, 운영상 필요한 경우 회사가 관리·정리(폐쇄 등) 조치를 할 수 있습니다</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">좋아요·팔로우·컬렉션</td>
                <td className="p-2 border-b border-white/[0.06]">즉시 파기</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">알림 수신 기록</td>
                <td className="p-2 border-b border-white/[0.06]">즉시 파기</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">크레딧·보너스 잔액</td>
                <td className="p-2 border-b border-white/[0.06]">영구 소실 (환불·이체 불가)</td>
              </tr>
              <tr>
                <td className="p-2 border-b border-white/[0.06]">친구 초대 관계</td>
                <td className="p-2 border-b border-white/[0.06]">초대자 카운터·통계는 익명화 후 유지, 본인 측 정보는 파기</td>
              </tr>
              <tr>
                <td className="p-2">법령상 보존이 필요한 정보</td>
                <td className="p-2">관련 법령에서 정한 기간 동안 별도 보관 후 파기</td>
              </tr>
            </tbody>
          </table>
        </div>
        <List items={[
          '회원이 직접 삭제하지 않은 공개 게시물은 탈퇴 이후에도 익명화된 상태로 서비스 내에 유지될 수 있습니다.',
          '탈퇴 후에도 동일 이메일·동일 OAuth 식별자로 재가입은 가능하나, 이전 계정과 연결되지 않은 신규 회원으로 처리됩니다.',
        ]} />
        <p className="mt-3 text-sm">
          <span className="text-white font-medium">※ 7일 유예 기간(grace period):</span>{' '}
          회원 탈퇴 후 7일 이내에 동일한 OAuth 계정으로 다시 로그인하면 자동으로 탈퇴가 취소되고 모든 데이터가 복원됩니다.
          7일이 경과하면 위 표에 명시된 데이터 처리 방식에 따라 영구 파기됩니다.
        </p>
      </Section>

      <Section title="제8조 (최종 안내)">
        <p>
          본 운영정책은 회사의 정책 및 서비스 운영 환경에 따라 변경될 수 있으며, 변경 사항은 별도 공지를 통해 안내됩니다.
          이용자는 본 운영정책을 숙지하고 준수해야 하며, 이를 위반할 경우 서비스 이용에 제한이 있을 수 있습니다.
          모두가 함께 즐길 수 있는 건강한 음악 커뮤니티를 만들어 주세요.
        </p>
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

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-zinc-600">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}

function Ban({ title, lead, items, note, penalty }: {
  title: string
  lead?: string
  items: string[]
  note?: string
  penalty: string
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-white">{title}</h3>
      {lead && <p>{lead}</p>}
      <Bullets items={items} />
      {note && <p className="text-xs text-zinc-500">※ {note}</p>}
      <p className="text-zinc-400">제재: {penalty}</p>
    </div>
  )
}
