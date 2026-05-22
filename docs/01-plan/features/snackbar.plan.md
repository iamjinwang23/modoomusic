# snackbar Planning Document

> **Summary**: 액션 결과를 일관되게 알려주는 글로벌 토스트 시스템 — 3-variant + 이벤트 버스 + 드래그 dismiss + 실행 취소
>
> **Project**: 오늘의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-05-22
> **Status**: Done (1차 구현 완료)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 회원가입·로그아웃·삭제·게시 같은 핵심 액션에 무피드백 또는 임시 alert()만 있어 사용자가 결과를 확신할 수 없음 |
| **Solution** | 이벤트 버스 기반 글로벌 토스트(success/error/info) + 24개 액션 카피 정의 + 5초 실행 취소 + 드래그 dismiss |
| **Function/UX Effect** | 모든 상태 변화에 일관된 시각·청각(aria-live) 피드백, "실행 취소"로 실수 즉시 복구, 미니바와 자동 위치 회피 |
| **Core Value** | 신뢰감 있는 즉시 피드백 + 최소 코드 부담(`toast.success('...')` 한 줄) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | UX 일관성·신뢰감 확보. 무피드백 액션이 사용자 신뢰를 깎고 있었음 |
| **WHO** | 모든 로그인 유저 — 특히 곡·컬렉션을 빈번히 만들고 정리하는 활성 사용자 |
| **RISK** | 글로벌 이벤트 남용 시 스팸/중복 토스트. 미니바·헤더와 시각 충돌 |
| **SUCCESS** | 24개 액션 모두 와이어드, 실행 취소 동작, 드래그로 닫기 가능, 미니바와 겹치지 않음 |
| **SCOPE** | 인프라 3파일 + 12개 액션 사이트 + restore API 2개 (1차). 큐 우선순위·dedupe·undo의 진짜 backend persist는 2차로 보류 |

---

## 1. Goals

- 모든 상태 변화 액션에 일관된 시각 피드백
- "실수 → 즉시 복구" 가능 (곡·컬렉션 삭제 등)
- 미니바 위치와 충돌 없이 자연스럽게 배치
- 새 액션 추가가 한 줄로 끝나는 단순한 API
- 한국어 UX 톤 유지

## 2. Non-Goals (1차)

- 큐 우선순위(error > success > info)
- 같은 메시지 dedupe (스팸 방지)
- 5초 지연 삭제(soft delete) 방식 — 1차는 "즉시 삭제 + 스냅샷 보관 + 복원" 형태
- 푸시 알림·이메일 알림 연동

## 3. 핵심 결정 사항

| # | 결정 | 채택 | 폐기 | 이유 |
|---|---|---|---|---|
| 1 | variant 수 | success / error / info (3단) | warning 별도 추가 | MVP에 충분. warning은 error로 통합 |
| 2 | 위치 | 하단 중앙 (fixed) | 우측 하단, 상단 중앙 | 모바일·데스크톱 공통 친화, 한국 서비스 관례 |
| 3 | API 스타일 | 이벤트 버스 (`window.dispatchEvent('toast', ...)`) | Context Provider + useToast hook | 기존 프로젝트 컨벤션(view-song·profile-updated 등)과 일관 |
| 4 | 액션 버튼 | 지원 (실행 취소·다시 시도) | 텍스트만 | 핵심 UX — 사용자 실수 복구·에러 retry 가능 |
| 5 | 드래그 dismiss | 60px threshold로 아래로 끌면 닫힘 | 토스트 자체 클릭으로 닫기 | 모바일 친화 + 의도적 닫기 명확 |
| 6 | 호버 시 타이머 | 일시정지 | 강제 dismiss | 읽는 중 사라지면 답답함 |
| 7 | 스택 한도 | 최대 3개 (오래된 것 자동 제거) | 무제한 + 스크롤 | 화면 점유 ↓, 4번째 들어오면 가장 오래된 것 즉시 제거 |
| 8 | duration | success 3s · info 4s · error 5s | 모두 동일 | error는 사용자가 읽고 retry 결정하는 시간 필요 |
| 9 | 미니바 충돌 | 미니바 활성 시 bottom +96px | 미니바 위에 겹치게 | 컨트롤 가림 방지 |
| 10 | 디자인 | 밝은 배경(zinc-100) + 컬러 뱃지 + 다크 텍스트 | 다크 배경 + 컬러 사이드라인 | 다크 테마에서 토스트가 잘 보이는 검증된 패턴 (Sonner·Apple·M3) |

## 4. 시스템 아키텍처

```
[모든 컴포넌트]
   ↓ toast.success(msg, opts?) 또는 window.dispatchEvent('toast', {...})
[ToastHost] (HomeLayout에 1개 마운트)
   ↓ 큐 관리 · 자동 dismiss · 스택 렌더 · 미니바 회피 offset
[ToastItem × N] (애니메이션 + 드래그 + 호버 일시정지 + 액션 버튼)
```

### 파일 구조

```
components/toast/
├── toast.ts            — toast.success/error/info() 헬퍼 + 이벤트 dispatch
├── ToastHost.tsx       — 글로벌 호스트 (이벤트 리스닝·스택 관리·위치)
└── ToastItem.tsx       — 개별 토스트 UI + 인터랙션
```

### 이벤트 컨트랙트

```ts
window.dispatchEvent(new CustomEvent('toast', {
  detail: {
    type: 'success' | 'error' | 'info',
    message: string,
    description?: string,
    action?: { label: string, onClick: () => void },
    duration?: number,
  }
}))
```

## 5. 액션 카피 인벤토리 (1차 24개)

### 🔐 인증
| 액션 | type | message | action |
|---|---|---|---|
| 회원가입 완료 (온보딩) | success | `회원가입이 완료되었어요` | — |
| 로그아웃 | info | `로그아웃 되었어요` | — |
| 로그아웃 실패 | error | `로그아웃 중 오류가 발생했어요` | — |
| 이메일/Apple/Kakao 로그인 미지원 안내 | info | `이메일 로그인은 곧 지원될 예정이에요` 등 | — |

> 로그인 성공 토스트는 1차에서 제외 — Supabase의 `INITIAL_SESSION` 이벤트와 진짜 로그인 이벤트가 구별 어려워 새로고침마다 토스트 뜨는 부작용 방지. 온보딩 완료(=신규 가입) 토스트로 환영 메시지를 대체.

### 👤 프로필
| 액션 | type | message | action |
|---|---|---|---|
| 프로필 저장 | success | `프로필이 업데이트되었어요` | — |
| 프로필 저장 실패 | error | `저장 중 오류가 발생했어요` | "다시 시도" |
| 아바타 업로드 성공 | success | `프로필 사진이 변경되었어요` | — |
| 아바타 업로드 실패 | error | `사진 업로드에 실패했어요` | — |
| 아바타 삭제 | info | `프로필 사진이 제거되었어요` | — |
| 커버 업로드 성공 | success | `커버 이미지가 변경되었어요` | — |
| 커버 업로드 실패 | error | `커버 업로드에 실패했어요` | — |
| 커버 삭제 | info | `커버 이미지가 제거되었어요` | — |

### 🎵 곡
| 액션 | type | message | action |
|---|---|---|---|
| 곡 편집 저장 | success | `곡 정보가 저장되었어요` | — |
| 곡 생성 완료 | success | `곡이 완성됐어요` | **"들어보기"** → 즉시 재생 |
| 곡 생성 실패 | error | `곡 생성에 실패했어요` (description: 에러 메시지) | — |
| 곡 삭제 | info | `곡이 삭제되었어요` | **"실행 취소"** (5s) → 복원 후 `곡이 복원되었어요` success |
| 곡 게시 완료 | success | `곡이 게시되었어요` | — |
| 곡 게시 취소 | info | `게시가 취소되었어요` | — |

> 곡 생성은 100초 이상 걸리므로 사용자가 다른 페이지로 이동할 가능성이 높음 → Suno 패턴 따라 완료 시 토스트 + "들어보기" 액션. fetch는 abort 안 되어 백그라운드 계속 진행, `ToastHost`가 root layout이라 어느 페이지든 표시됨
> 정책성 에러(DAILY_LIMIT·MODEL_LOCKED)는 토스트가 아니라 `ComingSoonModal`로 처리

### 📂 컬렉션
| 액션 | type | message | action |
|---|---|---|---|
| 컬렉션 생성 | success | `컬렉션이 만들어졌어요` / `'{이름}' 컬렉션이 만들어졌어요` | — |
| 컬렉션 삭제 | info | `컬렉션이 삭제되었어요` | **"실행 취소"** (5s) → 복원 후 `컬렉션이 복원되었어요` success |
| 곡 컬렉션에 담음 | success | `'{컬렉션명}'에 담았어요` | — |
| 곡 컬렉션에서 제거 | info | `'{컬렉션명}'에서 제거되었어요` / `컬렉션에서 제거되었어요` | **"실행 취소"** (5s, CollectionDetailView 한정) |

### 🔗 공유·복사
| 액션 | type | message |
|---|---|---|
| 링크 복사 성공 | success | `링크가 복사되었어요` |
| 링크 복사 실패 | error | `링크 복사에 실패했어요` |
| 가사·스타일 복사 | success | `복사되었어요` |
| 복사 실패 | error | `복사에 실패했어요` |

## 6. 카피 톤 규칙

- 반말 X, 존댓말 "~요" 종결 — 친근하지만 가벼움
- 과거형으로 결과 알림: "삭제되었어요" / "만들어졌어요" / "변경되었어요"
- 부정형 안 씀: "삭제되지 않았어요" 대신 "삭제에 실패했어요"
- 액션 라벨은 동사형: "실행 취소", "다시 시도"
- 자랑 X: "곡이 게시되었어요" O / "축하해요! 게시 완료!" X
- 절대 농담·이모지 X (Free 토스트는 비즈니스 톤)

## 7. 정책 정리

| 항목 | 값 |
|---|---|
| 위치 | `fixed bottom-X left-1/2 -translate-x-1/2`, max-w-440px |
| 미니바 활성 | bottom: `calc(96px + env(safe-area-inset-bottom))` |
| 미니바 비활성 | bottom: `calc(24px + env(safe-area-inset-bottom))` |
| 자동 dismiss | success 3s · info 4s · error 5s · 액션 있을 때 5s |
| 호버 동작 | 타이머 일시정지, 마우스 떠나면 남은 시간으로 재개 |
| 드래그 동작 | 아래로 60px 이상 → dismiss, 미만 → 원위치 + 타이머 재개 |
| 스택 | 최신 위로, 최대 3개. 4번째 dispatch 시 가장 오래된 것 제거 |
| 접근성 | `role="status"`, `aria-live="polite"`(success/info) / `"assertive"`(error) |
| 디자인 | bg-zinc-100 + 텍스트 zinc-900/500 + 5px 컬러 뱃지(teal/red/sky) |

## 8. Restore API (실행 취소 인프라)

### songService
```ts
delete(id: string): Song | null   // 삭제하면서 스냅샷 반환
restore(snapshot: Song): void     // 스냅샷으로 복원
```

### collectionService
```ts
delete(id: string): Collection | null
restore(snapshot: Collection): void
addSongRestore(collectionId: string, songId: string, index: number): void
```

호출 패턴:
```ts
const snapshot = songService.delete(song.id)
if (snapshot) {
  toast.info('곡이 삭제되었어요', {
    duration: 5000,
    action: { label: '실행 취소', onClick: () => songService.restore(snapshot) }
  })
}
```

## 9. 변경 영향 범위

### 신규
- `components/toast/toast.ts`
- `components/toast/ToastHost.tsx`
- `components/toast/ToastItem.tsx`
- `components/toast/README.md` (개발자 가이드)
- `docs/01-plan/features/snackbar.plan.md` (이 문서)

### 수정
- `app/HomeLayout.tsx` — ToastHost 마운트
- `services/song.service.ts` — delete 반환값, restore 추가
- `services/collection.service.ts` — delete 반환값, restore·addSongRestore 추가
- `components/AuthProvider.tsx` — 로그아웃 토스트
- `components/OnboardingModal.tsx` — 회원가입 완료
- `components/ProfileEditModal.tsx` — 저장 성공·실패
- `components/SongEditModal.tsx` — 저장
- `components/SongDetailPage.tsx` — 삭제 undo, 공유, 복사
- `components/GlobalMiniBar.tsx` — 공유
- `components/LoginModal.tsx` — alert 제거
- `features/explore/components/ProfilePanel.tsx` — 아바타·커버 4종
- `features/song/components/MyWorkPanel.tsx` — 삭제 undo, 게시 취소, 공유
- `features/song/components/MyCollectionPanel.tsx` — 컬렉션 삭제·생성·곡 제거 undo
- `features/song/components/CollectionPickerModal.tsx` — 담기/제거/생성
- `features/song/components/PublishModal.tsx` — 게시
- `features/song/hooks/useSongGeneration.ts` — 생성 실패
- `features/auth/components/AuthForm.tsx` — alert 제거

### 삭제
- 임시 `alert()` 호출 4건 (AuthForm 2, LoginModal 2)

### DB·API 변경
- 없음 (순수 클라이언트 사이드)

## 10. 보류 항목 (2차)

| 항목 | 이유 |
|---|---|
| 큐 우선순위 (error > success > info) | 1차에선 동등 처리, 사용 패턴 보고 결정 |
| 같은 메시지 dedupe | 스팸 패턴 관찰 후 도입 |
| Undo 토스트의 진짜 5초 지연 삭제 (soft delete) | 현재는 즉시 삭제 + 스냅샷 보관. DB 영향 없는 단순 패턴이 1차에 안전 |
| 토스트 진입 애니메이션 다양화 | 현재 fade + translateY로 충분 |
| 토스트 → 시스템 알림 센터 연동 | 알림 페이지 구현 후 검토 |

## 11. 연관 인프라

곡 생성처럼 100초+ 걸리는 작업은 토스트 1회만으로 부족 → **글로벌 생성 인디케이터(`GenerationChip`)**가 헤더에 상주.

- `services/generation.store.ts`: 모듈 싱글톤으로 진행 상태 + 시작 시각 보관, `'generation-state'` 이벤트로 변경 알림
- `useSongGeneration`이 시작/종료 시 `startGeneration()`/`endGeneration()` 호출
- `GenerationChip`: 헤더에서 곡명 + 경과 시간(예: `1:23`) 표시, 클릭 시 `/`로 이동
- 완료 시점에 토스트(`'곡이 완성됐어요'` + `들어보기` 액션) 트리거 → 어느 페이지든 알림 보장

> 디자인 의도: Suno 패턴 차용. 사용자가 생성 시켜놓고 다른 페이지를 자유롭게 둘러볼 수 있어야 함. fetch는 abort 안 하므로 페이지 이동에도 백그라운드 계속 진행.

## 11. 운영 가이드 (사용법)

새 액션에 토스트를 붙일 때:

```ts
import { toast } from '@/components/toast/toast'

// 기본
toast.success('저장되었어요')
toast.error('오류가 발생했어요')
toast.info('알림')

// 액션 버튼
toast.error('연결에 문제가 생겼어요', {
  action: { label: '다시 시도', onClick: () => retry() }
})

// duration 커스터마이즈
toast.info('곡이 삭제되었어요', { duration: 5000, action: {...} })

// 보조 설명
toast.error('곡 생성에 실패했어요', { description: '잠시 후 다시 시도해 주세요' })
```

새 카피 추가 시 §5 메시지 테이블에 같이 기록할 것 — 톤 일관성 유지가 핵심.
