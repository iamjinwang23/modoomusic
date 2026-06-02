# mobile-optimization Planning Document

> **Summary**: 모바일에서 데스크톱 사이드바·multi-column 레이아웃을 모바일 친화 패턴(하단 네비·탭·바텀시트)으로 전환해 핵심 화면 진입성과 가독성 확보
>
> **Project**: 오늘의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-05-22
> **Status**: Done (BottomNav·바텀시트·곡 상세 풀스크린·미니바·skeleton 로딩까지 완료)
> **Last Updated**: 2026-06-01

---

## Executive Summary

| Perspective | Content |
|---|---|
| **Problem** | 좌측 사이드바가 `md:` 미만에서 완전 숨김 → 모바일 사용자는 탐색·알림 페이지 진입 자체가 불가능. 음악 만들기는 SongForm만 보이고 MyWorkPanel(내 작업)은 안 보임. 모달이 데스크톱 풀화면 정중앙이라 모바일에서 좁고 답답함 |
| **Solution** | 하단 4탭 네비 + 음악 만들기 2탭 + 모달 바텀시트화 + 프로필 커버 비율 적응 + 헤더 모바일 잔여물 정리 |
| **Function/UX Effect** | 한 손 엄지 도달 범위에 모든 메인 네비 배치, 모달이 화면 폭 100% 활용, 헤더 깔끔, 데스크톱 레이아웃은 무영향 |
| **Core Value** | 모바일에서도 데스크톱과 동일한 핵심 기능에 자유롭게 접근 |

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 내부 테스트 시작 — 사용자 대부분이 휴대폰으로 접근. 좌측 사이드바 의존 구조라 모바일 진입이 막혀 있음 |
| **WHO** | 모바일(특히 iOS Safari·Android Chrome) 사용자, 데스크톱 사용자는 무영향 |
| **RISK** | 하단 네비·미니바·토스트 위치 충돌. 모달 바텀시트로 전환 시 키보드(가상) 가림. iOS safe-area-inset 처리 미흡 |
| **SUCCESS** | 모바일에서 모든 메인 페이지(만들기·라이브러리·탐색·알림·프로필) 1탭 진입. 음악 만들기 시 SongForm·MyWork 모두 접근. 모달이 모바일에서 답답하지 않음 |
| **SCOPE** | 신규 BottomNav 1개, 5~7개 파일 수정. 데스크톱 레이아웃은 완전 격리(md: 분기) |

---

## 1. Goals

- 모바일에서 사이드바 nav 4개 항목(만들기·라이브러리·탐색·알림) 모두 1탭 접근
- `/` 페이지에서 SongForm·MyWorkPanel 모두 모바일에서 접근 가능
- 모달이 모바일에서 시각적으로 답답하지 않게
- 프로필 커버가 모바일에서 너무 좁아 보이지 않게
- iOS 홈 인디케이터(safe-area-inset) 자연스럽게 회피
- 데스크톱(`md:` 이상) 동작은 일체 변경 없음

## 2. Non-Goals (1차)

- 터치 제스처(스와이프 곡 탐색·미니바 스와이프 풀화면) — 별도 스펙
- 모바일 전용 인터랙션 패턴(pull-to-refresh, infinite scroll 등)
- 모바일 푸시 알림
- 모바일 미니바 풀화면 플레이어 전환 (Spotify식)
- PWA 인스톨 가능 메타·아이콘 (별도)

## 3. 핵심 결정 사항

| # | 결정 | 채택 | 이유 |
|---|---|---|---|
| 1 | 하단 네비 탭 수 | **4개** (만들기·라이브러리·탐색·알림) | 좌측 사이드바와 동일. 프로필은 헤더 아바타로 유지 |
| 2 | 헤더 모바일 라이브러리 버튼 + 우측 drawer | **제거** | 하단 네비의 라이브러리 탭으로 대체 — 중복 해소 |
| 3 | 음악 만들기 모바일 레이아웃 | **2개 탭 토글** (음악 만들기 / 내 음악) | 데스크톱 2컬럼을 모바일에서 단일 컬럼 + 탭 전환으로 동등 접근성 확보 |
| 4 | 모달 표시 형태(모바일) | **바텀시트** (하단에서 슬라이드업, 최대 80vh) | iOS 네이티브 표준. 화면 폭 100% 활용 |
| 5 | 프로필 커버 비율 | **데스크톱 1064:368 유지, 모바일 16:9** | 모바일에서 너무 납작해 보이는 문제 해결 |
| 6 | 하단 네비 위치 | `fixed bottom-0 left-0 right-0 z-50 md:hidden` + 본문에 `pb-` 보정 | iOS Safe Area 자동 추가(`env(safe-area-inset-bottom)`) |
| 7 | 미니바·토스트와의 충돌 | 하단 네비 + 미니바 활성 시 토스트는 둘 다 위로 회피 | 기존 `useGlobalPlayer().song`에 BottomNav 존재 여부 추가 |

## 4. 시스템 아키텍처

```
모바일(<md):
┌──────────────────┐
│ 헤더 (mono 로고 · 크레딧 · 아바타) │  ← drawer 버튼 제거
├──────────────────┤
│                  │
│   본문 (1컬럼)    │
│                  │
├──────────────────┤
│ 미니바 (재생 중)  │  ← BottomNav 위
├──────────────────┤
│ BottomNav 4탭    │  ← 신규
└──────────────────┘
    safe-area
```

```
데스크톱(md+):
┌─────────────────────────┐
│ 헤더                     │
├──┬──────────────────┬───┤
│  │ 본문(센터)         │우 │   ← 변경 없음
│사│                  │측 │
│이│                  │   │
│드│                  │   │
│바│                  │   │
├──┴──────────────────┴───┤
│ 미니바                   │
└─────────────────────────┘
```

## 5. 파일 변경 영향

### 신규
- `components/BottomNav.tsx` — 4탭 하단 고정 네비
- `docs/01-plan/features/mobile-optimization.plan.md` (이 문서)

### 수정
- `app/(main)/layout.tsx` — `<BottomNav />` 마운트, 헤더 모바일 라이브러리 버튼·drawer 제거, 본문 `pb-` 보정
- `app/(main)/page.tsx` — 음악 만들기 페이지: 모바일은 탭 토글, 데스크톱은 그대로
- `app/(main)/layout.tsx` Center panel 분기 정리 — `isCreate` 분기에서 우측 MyWorkPanel은 `hidden md:flex` 그대로(이미 적용), 모바일은 page.tsx 내부 탭이 담당
- `features/explore/components/ProfilePanel.tsx` — 커버 비율 `aspectRatio: '1064 / 368'` → 모바일 `aspectRatio: '16 / 9'`, 데스크톱 기존 비율 (Tailwind `md:` 분기)
- `components/toast/ToastHost.tsx` — bottom offset 계산에 BottomNav 높이 추가 (모바일 + nav 존재 시)
- `components/ProfileEditModal.tsx`, `components/SongEditModal.tsx`, `features/song/components/CollectionPickerModal.tsx` — 모바일 바텀시트 스타일 (max-h-[85vh], rounded-t-2xl, bottom-0 정렬)

### DB·API
- 없음 (순수 UI)

## 6. 구현 디테일

### BottomNav

```tsx
// components/BottomNav.tsx
'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/',              label: '만들기',   icon: '/Music-Create.svg' },
  { href: '/library',       label: '라이브러리', icon: '/Music-Library.svg' },
  { href: '/explore',       label: '탐색',     icon: '/Compass.svg' },
  { href: '/notifications', label: '알림',     icon: '/Notification.svg' },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#111318] border-t border-white/[0.08] grid grid-cols-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {ITEMS.map((it) => {
        const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href)
        return (
          <Link key={it.href} href={it.href}
            className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              active ? 'text-white' : 'text-zinc-500'
            }`}
          >
            <Image src={it.icon} alt="" width={22} height={22}
              style={{ filter: active ? 'invert(1)' : 'invert(0.45)' }} />
            <span className="text-[10px] font-medium">{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

### 본문 padding-bottom

미니바·BottomNav 둘 다 fixed가 아니라 layout flow 안에 있어야 본문이 자연스럽게 밀려나는 게 좋음. 하지만 GlobalMiniBar는 이미 main 안의 flex 아이템이고, BottomNav는 fixed로 추가 → 본문에 `pb-[56px+safe-area]` 추가 필요.

→ **(main) layout의 main에 `pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0`** 추가

### 토스트 위치 보정

`ToastHost`의 bottom offset 계산:
- 데스크톱: 미니바 활성 96px / 비활성 24px (현재)
- 모바일: 미니바 활성 96 + 56 = 152px / 비활성 56 + 24 = 80px

```ts
const isMobile = useMediaQuery('(max-width: 767px)')  // 또는 CSS-only로
const offset = isMobile
  ? (hasMiniBar ? 152 : 80)
  : (hasMiniBar ? 96 : 24)
```

→ JS로 미디어쿼리 하기 싫으면 Tailwind 클래스로:
```tsx
className={`fixed left-1/2 -translate-x-1/2 z-[90] ${hasMiniBar ? 'bottom-[152px] md:bottom-24' : 'bottom-20 md:bottom-6'}`}
```

### 음악 만들기 페이지 탭

```tsx
// app/(main)/page.tsx
'use client'
import { useState } from 'react'
import { SongForm } from '@/features/song/components/SongForm'
import { MyWorkPanel } from '@/features/song/components/MyWorkPanel'

export default function CreatePage() {
  const [tab, setTab] = useState<'create' | 'mywork'>('create')
  return (
    <>
      {/* 모바일: 탭 토글 */}
      <div className="md:hidden flex border-b border-white/[0.06]">
        <button onClick={() => setTab('create')} className={`flex-1 py-3 text-sm ${tab==='create'?'text-white border-b-2 border-white':'text-zinc-400'}`}>음악 만들기</button>
        <button onClick={() => setTab('mywork')} className={`flex-1 py-3 text-sm ${tab==='mywork'?'text-white border-b-2 border-white':'text-zinc-400'}`}>내 음악</button>
      </div>
      {/* 모바일에서만 활성 탭에 따라 렌더 / 데스크톱은 둘 다 안 보여줌 (layout이 우측에 MyWorkPanel 배치) */}
      <div className="md:hidden">
        {tab === 'create' ? <div className="px-6 py-6"><SongForm /></div> : <MyWorkPanel />}
      </div>
      <div className="hidden md:block px-6 py-6">
        <h1 className="text-xl font-semibold mb-6">음악 만들기</h1>
        <SongForm />
      </div>
    </>
  )
}
```

### 모달 바텀시트 스타일

각 모달의 wrapper에 모바일 분기 추가:
- 정렬: `items-end md:items-center` (모바일은 하단)
- 모양: `rounded-t-2xl md:rounded-2xl rounded-b-none md:rounded-b-2xl`
- 폭/높이: `max-w-full md:max-w-[420px]` + `max-h-[85vh]`
- 진입 애니메이션: 모바일은 `translateY(100%)` → `0`, 데스크톱은 기존 scale/translateY 유지

### 프로필 커버 비율

```tsx
<div
  className={`relative w-full rounded-2xl overflow-hidden ${isSelf ? 'group/cover' : ''}`}
  style={{ background: profileColor(profile.avatarHue).bg }}
>
  <div className="aspect-video md:aspect-[1064/368] w-full">
    {/* 기존 children 그대로 */}
  </div>
</div>
```
→ 모바일 16:9, 데스크톱 2.89:1 그대로.

## 7. Success Criteria

- [ ] 모바일에서 하단 네비 항상 노출, 4탭 클릭 시 페이지 전환
- [ ] 현재 페이지에 해당하는 탭이 시각적으로 활성 표시
- [ ] 미니바 활성 시 네비 위에 미니바 올라감, 토스트는 둘 다 위로 회피
- [ ] iOS Safari Home Indicator 영역에 가려지지 않음 (safe-area-inset)
- [ ] / 페이지 모바일에서 탭으로 SongForm·MyWorkPanel 둘 다 접근
- [ ] 모달 3종 모바일에서 하단 시트 형태로 표시, 데스크톱은 기존 중앙 정렬 유지
- [ ] 프로필 커버 모바일에서 16:9로 보이고 너무 좁아 보이지 않음
- [ ] 헤더에 모바일 '🎵 라이브러리' 버튼 없음, drawer 코드 제거됨
- [ ] 데스크톱 화면 어디서도 시각적 변화 없음 (회귀 0)

## 8. Risks

| 위험 | 완화책 |
|---|---|
| BottomNav가 가상 키보드 위에 떠서 입력 시 가림 | `position: fixed`라 자연스럽게 키보드 뜨면 viewport 밖으로 밀려남. 추가 처리 불필요 (검증) |
| 모달을 바텀시트로 바꾸면 폼 입력 시 키보드 + 시트 충돌 | `max-h-[85vh]` + 내부 스크롤로 회피 |
| 토스트가 BottomNav 위·미니바 위·키보드 위 동시에 위치 조정 필요 | 키보드 케이스는 1차에서 별도 처리 안 함, 사용자가 입력 중 토스트 거의 안 뜸 |
| 음악 만들기 페이지 탭 전환 시 SongForm 입력 상태 유실 | 두 컴포넌트 모두 페이지 안에서 mount 유지(조건부 display) → 상태 보존 |

## 9. 보류 (2차)

- 곡 카드 스와이프(좋아요·다음 곡) 등 모바일 제스처
- 미니바 풀화면 플레이어 전환
- PWA 인스톨 메타·앱 아이콘
- 다크/라이트 테마 자동 전환
- 모바일 헤더 sticky·scroll-hide 효과
