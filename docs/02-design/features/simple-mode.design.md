# simple-mode Design Document

> **Project**: 모두의 노래 (MONO)
> **Plan**: `docs/01-plan/features/simple-mode.plan.md`
> **Architecture**: 단일 `SongForm` + `mode` 플래그 + 상태 공유 (Plan §3-#1에서 확정)
> **Date**: 2026-05-29
> **Status**: Done (구현 완료, 2026-05-29)
> **Last Updated**: 2026-06-01

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 어드밴스드 진입장벽 완화 — 설명만 쓰고 바로 생성하는 라이트 경로 |
| **WHO** | 신규/라이트 사용자. 세밀 제어는 Advanced |
| **RISK** | 모드 전환 입력 유실(상태 공유로 방지) · 자동작사 1회 추가(크레딧이 게이트) · localStorage SSR 안전 |
| **SUCCESS** | 심플 설명+생성 완성 · "+가사"→어드밴스드 보존 · 인스트루멘탈 동작 · 크레딧 동일 표기 · 마지막 모드 복원 |
| **SCOPE** | SongForm mode 토글+심플 뷰+상태 공유 + generate 자동작사 분기 + 어드밴스드 제목 자동 채움 |

---

## 1. Overview

`SongForm`에 `mode: 'simple' | 'advanced'` 상태를 도입해 두 뷰를 조건부 렌더. 심플은 **설명(=stylePrompt 공유) + 인스트루멘탈 토글 + "+가사" + 음악 만들기**. 심플 생성은 `generate({ autoLyrics })`로 서버에 위임 → 서버가 `lyrics_generation`으로 자동작사·제목·스타일 태깅 후 `music_generation`. 부수적으로 어드밴스드 'AI 가사' 버튼도 `song_title`을 받아 제목을 자동 채움.

## 2. Architecture

```
SongForm (mode 상태 + 공유 state: stylePrompt, instrumental, title, ...)
 ├ ModeToggle  [Simple | Advanced]  (localStorage 영속)
 ├ mode==='simple'  → SimpleView (설명 textarea · 인스트루멘탈 · +가사 · CTA)
 └ mode==='advanced'→ 기존 폼 전체 (제목·모델·가사(+AI가사)·스타일(+칩)·보컬)
        │ 심플 제출
        ▼
  useSongGeneration.generate({ prompt:설명, autoLyrics:!instrumental, model, instrumental, title:'' , ... })
        │ POST /api/generate
        ▼
  route: 인증·모델·크레딧 선차감 → songs INSERT(generating) → 즉시 응답
        └ after(): autoLyrics면 generateLyrics(설명)→{lyrics,styleTags,songTitle}
                   → music_generation(prompt=styleTags+설명, lyrics) → UPDATE(title=songTitle, ...)
```

### Module Map

| Module | 파일 | 유형 | 역할 |
|---|---|---|---|
| M1 Service | `services/lyrics.service.ts` | 수정 | `generateLyrics` 반환 → `{ lyrics, styleTags, songTitle }` |
| M2 Backend | `app/api/generate/route.ts` · `app/api/lyrics/route.ts` | 수정 | generate에 `autoLyrics` 분기 + title=songTitle / lyrics 응답에 `songTitle` |
| M3 Adv title | `components/LyricsGenerateModal.tsx` · `features/song/components/SongForm.tsx` | 수정 | 'AI 가사' → 제목 비었을 때 자동 채움 |
| M4 Simple UI | `features/song/components/SongForm.tsx` | 수정 | mode 토글 + 심플 뷰 + 상태 공유 + localStorage + 심플 제출 + 모델 결정 |

## 3. 상태 모델 & 모드 영속화

기존 SongForm state 재사용 — **신규 필드 최소**:
- `stylePrompt` = 심플의 "설명" + 어드밴스드의 "스타일" (공유)
- `instrumental` (공유)
- 신규: `const [mode, setMode] = useState<'simple'|'advanced'>('simple')`

영속화 (SSR 안전 — 초기 'simple'로 서버 렌더 후 mount에서 복원):
```ts
const STORAGE_KEY = 'mono.songform.mode'
useEffect(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'advanced' || saved === 'simple') setMode(saved)
}, [])
function changeMode(next: 'simple'|'advanced') {
  setMode(next)
  localStorage.setItem(STORAGE_KEY, next)
}
```

전환 규칙:
- **"+가사" 버튼** → `changeMode('advanced')` (stylePrompt·instrumental 그대로 유지 → 설명이 스타일 필드에 보존, 가사 영역 노출)
- **상단 토글** → `changeMode(...)` 양방향, 공유 state 유지. 어드밴스드 전용 값(모델·제목·수동가사)은 심플 제출 시 미사용(어드밴스드 가면 복원)

## 4. API Contract

### 4.1 `services/lyrics.service.ts` — generateLyrics 반환 확장

```ts
export interface LyricsResult { lyrics: string; styleTags: string; songTitle: string }
export async function generateLyrics(prompt: string): Promise<LyricsResult>
```
- MiniMax 응답의 `lyrics`(sanitize) · `style_tags` · `song_title` 매핑
- MOCK_MODE: `{ lyrics: MOCK_LYRICS, styleTags: 'Pop, Ballad', songTitle: '오늘의 노래' }`

### 4.2 `POST /api/lyrics` — 응답에 songTitle 추가

```
200: { lyrics: string, songTitle: string }   // 기존 {lyrics} → songTitle 추가
```
(styleTags는 어드밴스드에서 미사용 → 응답 제외)

### 4.3 `POST /api/generate` — autoLyrics 분기

Request body 추가: `autoLyrics?: boolean`

| 입력 | 동작 |
|---|---|
| `autoLyrics: true` (심플 보컬) | after()에서 `generateLyrics(prompt)` → music_generation(`prompt = styleTags + ', ' + 원본prompt`, `lyrics`), 완료 UPDATE에 `title = songTitle`(단, 클라가 title 비워 보낸 경우) |
| `autoLyrics` 미지정/`false` | 기존 흐름 그대로 (customLyrics 사용) |

- 자동작사는 `lyrics.service.generateLyrics()` **직접 호출** → `/api/lyrics` 레이트리밋(15초/1분2회) **미적용**. 게이트는 크레딧.
- 인스트루멘탈 심플은 `autoLyrics:false` + `instrumental:true`로 보냄 → 기존 인스트루멘탈 경로.

## 5. UI

### 5.1 ModeToggle (상단)
- pill 토글 `[Simple | Advanced]` — 활성 = 흰 배경/검정 텍스트 톤(보컬 성별 토글과 유사 `bg-violet-600` 대신 중립). `[[project-ui-conventions]]`
- 음악 만들기 패널 최상단(곡 제목 섹션 위)

### 5.2 Simple View
```
[설명 섹션]  (rounded-xl border bg-[#1E2129])
  헤더: "설명"                          [인스트루멘탈 토글]
  textarea (stylePrompt 공유, placeholder "만들고 싶은 노래를 자유롭게 설명해주세요\n예) 싸움 후 침묵에 대한 감성적인 보사노바")
  하단: [+ 가사] (좌)                    0 / 2,000자 (우)
[음악 만들기  ✦ {credits}]
```
- `[+ 가사]`: 칩 스타일(어드밴스드 'AI 가사'와 동일 톤) → `changeMode('advanced')`
- CTA 크레딧 = `creditsForModel(effectiveModel)` (보컬 2.0=2 / 인스트루멘탈 2.6=10), 토글 따라 변동

### 5.3 어드밴스드 제목 자동 채움
- `LyricsGenerateModal`: fetch 응답에서 `songTitle`도 읽어 `onGenerated(lyrics, songTitle)` 전달
- `SongForm.handleLyricsGenerated(lyrics, songTitle?)`:
  ```ts
  if (lyrics.trim() && !confirm('현재 가사를 새로 만든 가사로 바꿀까요?')) return
  setLyrics(lyrics); if (instrumental) setInstrumental(false)
  if (songTitle && !title.trim()) setTitle(songTitle)  // 비었을 때만
  toast.success(songTitle && !title.trim() ? '가사와 제목을 만들었어요' : '가사를 만들었어요')
  ```

## 6. 모델 결정 (심플)

```ts
const effectiveModel: MusicModelId = instrumental ? 'music-2.6' : 'music-2.0'
```
- 인스트루멘탈은 2.0이 미지원 → 2.6 (기존 컨벤션과 동일, `[[feedback-code-pitfalls]]`)
- 심플 제출 시 위 effectiveModel 사용, 모델 선택 UI 없음

## 7. Simple 제출 흐름 (sequence)

```
SimpleView 음악 만들기 클릭
 → handleSubmit(simple): stylePrompt 비면 토스트, 아니면
   generate({
     prompt: stylePrompt, genre:'', mood:'', title:'',
     customLyrics:'', instrumental,
     model: instrumental ? 'music-2.6' : 'music-2.0',
     autoLyrics: !instrumental,
   })
 → /api/generate: 크레딧 선차감 → INSERT(generating) → 즉시 응답 → 캐시 add → "곡을 만들고 있어요"
   after(): autoLyrics → generateLyrics(prompt) → music_generation → UPDATE(title=songTitle, lyrics, audio, status=done)
 → realtime → 완료 토스트 + 카드 갱신 (기존 SongRealtimeBridge)
```

## 8. Error Handling
- 기존 generate 경로 재사용 (DAILY_LIMIT/MODEL_LOCKED/실패 환불). 자동작사 실패 시 after() catch → status=failed + 환불(기존).
- generateLyrics 내부 실패는 throw → after() catch가 처리.

## 9. Test Plan

**L1 — API**
- `/api/generate { autoLyrics:true, prompt }` → 200 즉시 응답(generating), 잠시 후 곡 done + title 채워짐 + lyrics 존재
- `/api/generate { instrumental:true }`(심플 인스트루멘탈) → 모델 2.6, lyrics 없음
- `/api/lyrics` → 응답에 `songTitle` 포함

**L2 — UI**
- 토글 Simple↔Advanced 전환 시 설명/인스트루멘탈 보존
- "+가사" → 어드밴스드 전환 + 설명이 스타일에 유지
- 심플 설명+생성 → "곡을 만들고 있어요" → 완료
- 인스트루멘탈 토글 시 CTA 크레딧 2→10 변동
- 어드밴스드 'AI 가사' → 제목 비었으면 자동 채움, 입력돼 있으면 유지
- 첫 방문 심플 / 새로고침 후 마지막 모드 복원

**L3 — E2E**: 심플 설명 → 자동작사 곡 생성 → 재생까지

## 10. Security
- `MINIMAX_API_KEY` 서버 전용 (generate/lyrics 라우트). 클라 변화 없음
- autoLyrics는 크레딧 차감 경로 안에서만 동작 → 무료 남용 불가

## 11. Implementation Guide

### 11.1 순서
1. **M1** generateLyrics 반환 확장 + 기존 호출부 정리(`/api/lyrics`는 lyrics+songTitle, 심플 내부는 전체 사용)
2. **M2** generate 라우트 autoLyrics 분기 + title 처리
3. **M3** 어드밴스드 제목 자동 채움 (modal + handleLyricsGenerated)
4. **M4** SongForm mode 토글 + 심플 뷰 + localStorage + 심플 제출 + 모델 결정
5. 검증: L1(curl) → L2(브라우저) → `pnpm tsc --noEmit`

### 11.2 의존성
- 신규 패키지 없음

### 11.3 Session Guide
- **Session 1 (백엔드/서비스)**: M1 + M2 — generateLyrics 확장 + generate autoLyrics. L1 검증
- **Session 2 (프론트)**: M3 + M4 — 어드밴스드 제목 채움 + 심플 모드 UI. L2/L3 검증
- `--scope` 예: `/pdca do simple-mode --scope M1,M2`
