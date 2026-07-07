# Toast (스낵바)

전역 토스트 시스템. 액션 결과를 한 줄로 알린다.

> 카피·정책 결정 기록은 [`docs/01-plan/features/snackbar.plan.md`](../../docs/01-plan/features/snackbar.plan.md)에 있음. **새 카피 추가 시 그쪽 메시지 테이블도 갱신할 것.**

## 빠른 사용

```ts
import { toast } from '@/components/toast/toast'

toast.success('저장되었어요')
toast.error('오류가 발생했어요')
toast.info('로그아웃 되었어요')
```

## variant

| variant | 언제 | 자동 dismiss | 색상 |
|---------|---|---|---|
| `success` | 액션이 의도대로 성공 | 3s | teal |
| `error`   | 실패·예외·재시도 필요 | 5s | red |
| `info`    | 중립적 알림·취소·삭제 결과 | 4s | sky |

## 옵션

```ts
toast.error('연결에 문제가 생겼어요', {
  description: '잠시 후 다시 시도해 주세요',  // 보조 한 줄
  action: { label: '다시 시도', onClick: retry },
  duration: 8000,  // ms, 생략 시 variant 기본값
})
```

## 사용자 인터랙션

- **호버**: 자동 dismiss 타이머 일시정지 (마우스 떠나면 남은 시간만큼 재개)
- **드래그 / 스와이프**: 아래로 60px 이상 끌면 dismiss
- **닫기 X**: 즉시 dismiss
- **액션 버튼 클릭**: `onClick` 실행 후 토스트 dismiss

## 실행 취소 패턴

삭제 액션은 스냅샷으로 복원 가능. `songService` / `collectionService`의 `delete()`는 스냅샷을 반환하니, `restore(snapshot)`을 action으로 묶으면 끝.

```ts
const snapshot = songService.delete(song.id)
if (snapshot) {
  toast.info('곡이 삭제되었어요', {
    duration: 5000,
    action: {
      label: '실행 취소',
      onClick: () => {
        songService.restore(snapshot)
        toast.success('곡이 복원되었어요')
      },
    },
  })
}
```

`collectionService.addSongRestore(collectionId, songId, index)`는 컬렉션에서 곡을 제거한 뒤 원래 위치로 복원할 때 사용.

## 정책성 에러는 토스트가 아님

- `DAILY_LIMIT` (크레딧 소진) → `ComingSoonModal` (reason: `'daily-limit'`)
- `MODEL_LOCKED` (Music 2.6/Cover 잠금 시도) → `ComingSoonModal` (reason: `'locked-model'`)

`/api/generate` 응답의 `code` 필드를 보고 `useSongGeneration`이 분기 처리한다.

## 호스트는 한 곳에만

`HomeLayout`에 `<ToastHost />`가 마운트되어 있다. 다른 페이지에서 추가로 마운트하지 말 것 — 같은 이벤트를 두 번 받아 중복 표시된다.

## 미니바와의 자동 정렬

`useGlobalPlayer().song`이 있으면(=재생 중) `bottom: calc(96px + safe-area)`로 자동 올라간다. 컨트롤 가림 걱정 없음.

## 카피 톤 규칙

- 존댓말 "~요" 종결 (반말 X)
- 결과는 과거형: `삭제되었어요`, `만들어졌어요`
- 부정형 회피: `삭제되지 않았어요` 대신 `삭제에 실패했어요`
- 액션 라벨은 동사형: `실행 취소`, `다시 시도`
- 이모지·농담 X (서비스 톤은 비즈니스)

## 이벤트로 직접 발행하기 (드물게)

`toast.*` 헬퍼는 내부적으로 `'toast'` 이벤트를 dispatch한다. 외부 모듈에서 의존성 없이 토스트를 띄우고 싶다면:

```ts
window.dispatchEvent(new CustomEvent('toast', {
  detail: { type: 'success', message: '저장되었어요' }
}))
```

타입은 `ToastPayload` (`components/toast/toast.ts`).

## 파일

| 파일 | 역할 |
|---|---|
| `toast.ts` | 헬퍼·타입·duration 기본값 |
| `ToastHost.tsx` | 이벤트 리스닝·스택 관리·위치 |
| `ToastItem.tsx` | 개별 토스트 UI + 드래그/호버 인터랙션 |
