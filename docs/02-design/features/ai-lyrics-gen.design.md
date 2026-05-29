# ai-lyrics-gen Design Document

> **Project**: 모두의 노래 (MONO)
> **Plan**: `docs/01-plan/features/ai-lyrics-gen.plan.md`
> **Architecture**: **Option C — 실용 균형** (가사 관심사를 `lyrics.service.ts`에 격리, 크레딧 경로 무수정)
> **Date**: 2026-05-29
> **Status**: Design

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 가사 작성 장벽 제거 + 일반 LLM 가사의 "지문 오염"을 MiniMax 전용 엔드포인트로 원천 차단 |
| **WHO** | 직접 가사를 쓰기 어렵거나 빠르게 초안이 필요한 모든 생성 사용자 |
| **RISK** | 가사 API 연타 → MiniMax RPM(1002)/비용. 연타 방지 레이트리밋(15초+1분2회)으로 방어 |
| **SUCCESS** | 버튼→팝업→생성→textarea 반영 · 크레딧 미차감 · 레이트리밋 초과 시 한국어 스낵바(잔여 미표시) · 지문 없는 구조 태그 가사 |
| **SCOPE** | 모달 1 + 라우트 1 + lyrics.service + profiles 타임스탬프 2컬럼 + SongForm 연결 |

---

## 1. Overview

가사 섹션 "AI 가사 생성" 버튼 → `LyricsGenerateModal` → 프롬프트 입력 → `POST /api/lyrics` → 서버가 레이트리밋 확인 후 MiniMax `/v1/lyrics_generation`(`write_full_song`) 호출 → 구조 태그 가사를 받아 SongForm의 `lyrics` textarea에 반영(전체 교체, 기존 내용 있으면 확인).

핵심 제약:
- **크레딧 미소모** — 곡 생성 경로(`tryConsumeCredits`)와 완전 분리
- **연타 방지** — 15초 쿨다운 + 1분 2회 (총량 제한 아님)
- **API 키 서버 전용** — 클라는 `/api/lyrics`만 호출

## 2. Architecture (Option C)

가사 관심사(MiniMax 호출 + 레이트리밋)를 신규 `services/lyrics.service.ts`에 격리. 쿨다운 방식은 일일 리셋이 불필요하므로 `credit.service.ts`는 **수정하지 않음**(KST 헬퍼 재사용도 불필요).

```
SongForm.tsx ──(버튼)──▶ LyricsGenerateModal.tsx
                              │ POST /api/lyrics { prompt }
                              ▼
                     app/api/lyrics/route.ts
                       ├─ createUserClient() → auth.getUser()  (401 가드)
                       ├─ createAdminClient() → profiles 읽기 (타임스탬프 2개)
                       ├─ lyrics.service: evaluateRate()  → 위반 시 429
                       ├─ lyrics.service: generateLyrics(prompt)  → MiniMax
                       └─ 성공 시 lyrics.service: commitGen() (타임스탬프 시프트)
                              │ { lyrics }
                              ▼
              setLyrics(결과) → 토스트 "가사를 만들었어요"
```

### Module Map

| Module | 파일 | 유형 | 역할 |
|---|---|---|---|
| M1 DB | `supabase/migrations/013_lyrics_gen_rate.sql` | 신규 | profiles 타임스탬프 2컬럼 |
| M2 Service | `services/lyrics.service.ts` | 신규 | `generateLyrics()` + 레이트리밋 read/eval/commit |
| M3 API | `app/api/lyrics/route.ts` | 신규 | 인증·리밋·생성 오케스트레이션 |
| M4 UI Modal | `components/LyricsGenerateModal.tsx` | 신규 | 프롬프트 팝업 |
| M5 UI Wire | `features/song/components/SongForm.tsx` | 수정 | 버튼 + 모달 + setLyrics 핸들러 |

## 3. Data Model

```sql
-- 013_lyrics_gen_rate.sql
-- 가사 생성 연타 방지: 최근 2회 생성 시각만 추적 (총량 제한 없음, 리셋 불필요)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_lyrics_gen_at timestamptz,
  ADD COLUMN IF NOT EXISTS prev_lyrics_gen_at timestamptz;
```

- 둘 다 nullable, default 없음 (최초 생성 전엔 NULL → 무제한 허용)
- 크레딧 컬럼(`daily_credits_used`, `last_credit_reset_at`)과 독립
- 수동 적용 (Supabase SQL Editor) — MCP 권한 없음, drift 주의 (`[[feedback-code-pitfalls]]`)

### 레이트리밋 판정 로직

```
last = last_lyrics_gen_at, prev = prev_lyrics_gen_at, now = Date.now()
violated =
  (last && now - last < 15_000)   // 쿨다운 15초
  || (prev && now - prev < 60_000) // 최근 1분에 이미 2회 존재
성공 시: prev ← (기존)last, last ← now
```

판정표 (t=0에서 시작):

| 시각 | 쿨다운 | 1분2회 | 결과 |
|---|---|---|---|
| 0s | last=NULL | prev=NULL | ✅ 허용 (last=0) |
| 15s | 15−0=15 ≥15 | prev=NULL | ✅ 허용 (prev=0, last=15) |
| 30s | 30−15=15 ≥15 | 30−0=30 <60 | ❌ 차단 (1분 내 3번째) |
| 61s | 61−15 ≥15 | 61−0 ≥60 | ✅ 허용 |

## 4. API Contract

### 4.1 우리 라우트 — `POST /api/lyrics`

**Request**
```json
{ "prompt": "여름 바다에서의 첫사랑을 노래하는 밝은 곡" }
```
- `prompt`: string, 필수(비어있으면 400). 서버에서 2000자로 캡(`slice(0, 2000)`)

**Response 200**
```json
{ "lyrics": "[Intro]\n...\n[Verse]\n...\n[Chorus]\n..." }
```
(`song_title`, `style_tags`는 응답에 포함하지 않음 — 결정 #2)

**Response 에러**

| status | body | 트리거 |
|---|---|---|
| 401 | `{ "error": "로그인이 필요해요", "code": "UNAUTHORIZED" }` | 미인증 |
| 400 | `{ "error": "프롬프트를 입력해 주세요", "code": "INVALID" }` | 빈 prompt |
| 429 | `{ "error": "잠시 후 다시 시도해 주세요", "code": "RATE_LIMITED" }` | 쿨다운/1분2회 위반 |
| 502 | `{ "error": "<한국어 매핑>", "code": "MINIMAX_ERROR" }` | MiniMax status_code≠0 |

### 4.2 MiniMax — `POST https://api.minimax.io/v1/lyrics_generation`

Headers: `Authorization: Bearer ${MINIMAX_API_KEY}`, `Content-Type: application/json`

```json
{ "mode": "write_full_song", "prompt": "<≤2000>" }
```

Response: `{ song_title, style_tags, lyrics, base_resp:{status_code,status_msg} }`

status_code 매핑: 0=성공 / 1002=레이트리밋 / 1004·2049=인증 / 1008=잔액부족 / 1026=민감콘텐츠 / 2013=파라미터 → §8.

## 5. Components

### 5.1 `LyricsGenerateModal.tsx` (신규)

`SongEditModal` 패턴 따름 (`[[project-ui-conventions]]` 모달 컨벤션):
- 데스크톱 `items-center + rounded-2xl max-w-[480px]`, 모바일 `items-end + rounded-t-2xl + safe-area`
- 헤더: 타이틀 "AI 가사 생성" + X 닫기
- 본문: 프롬프트 textarea (placeholder "어떤 노래를 만들까요? 자유롭게 적어주세요"), 안내 한 줄
- 푸터: [생성하기] 버튼 (sparkles 아이콘, hover white, 이모지 X)

Props:
```ts
interface Props {
  open: boolean
  onClose: () => void
  onGenerated: (lyrics: string) => void   // SongForm이 교체 확인 후 setLyrics
}
```

상태: `prompt`, `loading`. 제출 중 버튼 비활성(`loading`). **쿨다운 카운트다운 미표시** — 429는 토스트로만.

### 5.2 `SongForm.tsx` (수정, 가사 섹션 384–438행)

- "가사" 라벨 우측(인스트루멘탈 토글 옆 또는 라벨 옆)에 "AI 가사 생성" 버튼 추가
- 인스트루멘탈 ON(섹션 접힘) 시 버튼 미노출
- `onGenerated(lyrics)` 핸들러:
  ```ts
  function handleGenerated(next: string) {
    if (lyrics.trim() && !confirm('현재 가사를 새로 만든 가사로 바꿀까요?')) return
    setLyrics(next)
    if (instrumental) setInstrumental(false) // 가사 생겼으니 보컬 모드
    toast.success('가사를 만들었어요')
  }
  ```
  (confirm은 기존 패턴 확인 후 모달 내 인라인 확인 UI로 대체 가능 — Do 단계 판단)

## 6. Service — `services/lyrics.service.ts` (신규)

```ts
import { createAdminClient } from '@/lib/supabase/admin'

const COOLDOWN_MS = 15_000
const WINDOW_MS = 60_000
const MAX_PROMPT = 2000

interface RateRow { last_lyrics_gen_at: string | null; prev_lyrics_gen_at: string | null }

// 1) 레이트리밋 평가 (읽기)
export async function evaluateLyricsRate(userId: string): Promise<{ ok: boolean; row: RateRow }> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles')
    .select('last_lyrics_gen_at, prev_lyrics_gen_at').eq('id', userId).maybeSingle()
  const row: RateRow = { last_lyrics_gen_at: data?.last_lyrics_gen_at ?? null, prev_lyrics_gen_at: data?.prev_lyrics_gen_at ?? null }
  const now = Date.now()
  const last = row.last_lyrics_gen_at ? +new Date(row.last_lyrics_gen_at) : 0
  const prev = row.prev_lyrics_gen_at ? +new Date(row.prev_lyrics_gen_at) : 0
  if (last && now - last < COOLDOWN_MS) return { ok: false, row }
  if (prev && now - prev < WINDOW_MS) return { ok: false, row }
  return { ok: true, row }
}

// 2) 성공 후 타임스탬프 시프트
export async function commitLyricsGen(userId: string, row: RateRow): Promise<void> {
  const admin = createAdminClient()
  await admin.from('profiles').update({
    prev_lyrics_gen_at: row.last_lyrics_gen_at,   // 기존 last → prev
    last_lyrics_gen_at: new Date().toISOString(),
  }).eq('id', userId)
}

// 3) MiniMax 가사 생성
export async function generateLyrics(prompt: string): Promise<string> {
  // MOCK_MODE 시 MOCK_LYRICS 반환 (minimax.service와 동일 전략)
  const res = await fetch('https://api.minimax.io/v1/lyrics_generation', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'write_full_song', prompt: prompt.slice(0, MAX_PROMPT) }),
  })
  const data = await res.json()
  if (data.base_resp?.status_code !== 0) throw mapLyricsError(data.base_resp?.status_code)
  return sanitizeLyrics(data.lyrics ?? '')
}
```

- `mapLyricsError(code)`: status_code → 한국어 Error(+code). `minimax.service.translateMinimaxError`와 일관된 톤.
- `sanitizeLyrics(s)`: 14종 구조 태그가 아닌 **대괄호 지문 라인**만 제거(예: `[soft piano]`). 괄호 `()` 보컬 애드립은 유지. 화이트리스트 기반, 최소 필터 (`[[feedback-design-patterns]]` 과도 정규화 지양).
- MOCK_MODE는 `minimax.service`에서 export하거나 동일 조건 재사용.

## 7. Sequence

```
User → Modal: 프롬프트 입력 + 생성하기
Modal → /api/lyrics: POST {prompt}  (버튼 비활성)
route → userClient.auth.getUser(): 401 가드
route → lyrics.service.evaluateLyricsRate(uid)
  alt 위반 → route → Modal: 429 RATE_LIMITED → 토스트 "잠시 후..."
  else
    route → lyrics.service.generateLyrics(prompt) → MiniMax
      alt status_code≠0 → 502 MINIMAX_ERROR → 토스트(한국어)
      else
        route → lyrics.service.commitLyricsGen(uid,row)  (타임스탬프 시프트)
        route → Modal: 200 {lyrics}
        Modal → SongForm.onGenerated(lyrics): 교체확인 → setLyrics → 토스트 성공 → 모달 닫힘
```

## 8. Error Handling

```ts
function mapLyricsError(code?: number): Error & { code: string } {
  const msg = {
    1002: '지금 너무 많이 생성되고 있어요. 잠시 후 다시 시도해 주세요',
    1004: '서버 인증 문제가 생겼어요. 잠시 후 다시 시도해 주세요',
    2049: '서버 인증 문제가 생겼어요. 잠시 후 다시 시도해 주세요',
    1008: '서비스 크레딧이 부족해요. 관리자에게 문의해 주세요',
    1026: '입력한 내용이 정책에 맞지 않아요. 다른 표현으로 시도해 주세요',
    2013: '요청에 문제가 있어요. 다시 시도해 주세요',
  }[code ?? -1] ?? '가사를 만드는 중 문제가 생겼어요'
  const e = new Error(msg) as Error & { code: string }
  e.code = 'MINIMAX_ERROR'
  return e
}
```
- 한국어 UX 규칙: 부정형 회피, 결과 과거형, 친근 존댓말 (`[[project-ui-conventions]]`)

## 9. Test Plan

**L1 — API (`/api/lyrics`)**
- 미인증 → 401 UNAUTHORIZED
- 빈 prompt → 400 INVALID
- 정상 prompt → 200 `{lyrics}`, lyrics에 `[`구조태그 포함
- 즉시 재요청(15초 내) → 429 RATE_LIMITED
- 15초 간격 2회 후 1분 내 3번째 → 429 RATE_LIMITED
- (성공 후) profiles의 `daily_credits_used` **불변** 확인

**L2 — UI 액션**
- 버튼 클릭 → 모달 오픈
- 생성하기 → 로딩 → textarea 채워짐
- 기존 가사 있을 때 생성 → 교체 확인 노출
- 인스트루멘탈 ON → 버튼 미노출
- 429 → 토스트 "잠시 후 다시 시도해 주세요" (카운트다운 없음)

**L3 — E2E**
- 프롬프트 → 가사 생성 → 그대로 곡 생성까지 흐름

## 10. Security

- `MINIMAX_API_KEY`는 서버 라우트에서만 참조 → 클라 번들 미포함 (기존 generate 라우트와 동일)
- 인증: `createUserClient().auth.getUser()` 가드, 카운터 UPDATE는 `createAdminClient()`
- 입력: prompt 2000자 캡, 빈값 거부. MiniMax 1026(민감 콘텐츠)은 그대로 사용자 안내
- 레이트리밋: 서버 권위 판정(클라 카운트다운 없음 → 우회 불가)

## 11. Implementation Guide

### 11.1 구현 순서
1. **M1** 마이그레이션 작성 → Supabase SQL Editor 수동 적용 + 적용 확인
2. **M2** `lyrics.service.ts` (generateLyrics + evaluate/commit + mapError + sanitize)
3. **M3** `app/api/lyrics/route.ts` (AGENTS.md: Route Handler 가이드 확인 후)
4. **M4** `LyricsGenerateModal.tsx`
5. **M5** SongForm 버튼·핸들러 연결
6. 검증: L1(curl) → L2(브라우저) → `pnpm tsc --noEmit`

### 11.2 의존성
- 신규 npm 패키지 없음 (fetch·기존 supabase·toast 재사용)

### 11.3 Session Guide
- **Session 1 (백엔드)**: M1 + M2 + M3 — 마이그레이션·서비스·라우트. L1 curl 검증으로 종료
- **Session 2 (프론트)**: M4 + M5 — 모달·SongForm 연결. L2/L3 브라우저 검증
- `--scope` 예: `/pdca do ai-lyrics-gen --scope M1,M2,M3`
