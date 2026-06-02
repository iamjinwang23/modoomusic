# simple-mode Planning Document

> **Summary**: 음악 만들기에 Suno식 "심플 모드"를 추가 — 상단 Simple/Advanced 토글로 전환하고, 심플에서는 설명 한 줄 + 인스트루멘탈 토글만으로 생성. 서버가 설명을 분석해 자동 작사(MiniMax `lyrics_generation`)한 뒤 곧바로 음악을 생성. 기존 폼은 Advanced 모드로 유지.
>
> **Project**: 모두의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-05-29
> **Status**: Done (구현 완료, 2026-05-29)
> **Last Updated**: 2026-06-01

---

## Executive Summary

| Perspective | Content |
|---|---|
| **Problem** | 현재 폼(어드밴스드)은 스타일·가사·모델 등 입력 요소가 많아 "그냥 한 곡 빨리 뽑고 싶은" 사용자에겐 진입장벽이 높음 |
| **Solution** | 상단 Simple/Advanced 토글 + 심플 뷰(설명 textarea + 인스트루멘탈 토글 + 생성). 생성 시 서버가 `lyrics_generation`으로 자동 작사·스타일 태깅 후 `music_generation` 실행 |
| **Function/UX Effect** | 설명 한 줄 → 생성 한 번으로 완성. "+가사" 누르면 어드밴스드로 자연스럽게 이동(입력 보존). 우리가 가진 가사 생성 API를 그대로 재사용 |
| **Core Value** | 신규·라이트 사용자의 첫 생성까지 마찰 최소화. 어드밴스드와 동일 백엔드를 공유해 추가 비용·복잡도 최소 |

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 어드밴스드 폼의 진입장벽 완화 — "설명만 쓰고 바로 생성"하는 라이트 경로 제공 |
| **WHO** | 신규/라이트 사용자(빠른 생성). 세밀한 제어를 원하면 Advanced로 전환 |
| **RISK** | (1) 두 모드 전환 시 입력 유실 → 상태 공유로 방지 (2) 자동 작사 1회 추가 호출(레이트리밋 아닌 크레딧이 게이트) (3) 모드 상태 영속화(localStorage) SSR 안전 |
| **SUCCESS** | 심플에서 설명+생성만으로 곡 완성 · "+가사"→어드밴스드 입력 보존 · 인스트루멘탈 토글 동작 · 크레딧 어드밴스드와 동일 표기 · 마지막 모드 복원 |
| **SCOPE** | SongForm에 mode 토글 + 심플 뷰 + 상태 공유 + 서버 자동작사 분기. Suno의 Audio/Voice/Inspo/주사위 등 부가기능 비포함 |

---

## 1. Goals

- 상단 **Simple/Advanced 토글** — 같은 생성 상태의 두 뷰
- 심플 뷰: **설명 textarea + 인스트루멘탈 토글 + "+가사" 버튼 + 음악 만들기**
- 심플 생성 = 서버 **자동 작사**(`lyrics_generation`) → `music_generation` (인스트루멘탈이면 작사 생략)
- 두 모드 전환 시 **입력 보존**(양방향)
- **첫 진입 심플 기본**, 이후 **마지막 선택 모드 복원**(localStorage)
- 크레딧은 어드밴스드와 동일하게 음악 생성분만, CTA에 동일 표기

## 2. Non-Goals (1차)

- Suno의 `+ Audio`(참조 오디오는 어드밴스드의 Music 2.6 커버로 이미 존재), `+ Voice`, `+ Inspo`, 주사위(랜덤) 버튼
- 심플 전용 Suggestion 칩 (1차는 미포함 — 추후 검토)
- 심플에서 모델/제목 직접 선택·편집 (제어가 필요하면 Advanced)
- 심플 모드 자체의 가사 직접 입력 (그게 "+가사" → Advanced의 역할)

## 3. 핵심 결정 사항

| # | 결정 | 채택 | 이유 |
|---|---|---|---|
| 1 | 폼 구조 | **단일 `SongForm` + `mode: 'simple' \| 'advanced'` 플래그 + 조건부 렌더** | 전환 시 상태 공유로 입력 보존이 핵심. 분리 컴포넌트는 상태 끌어올리기·중복 발생 |
| 2 | 기본 모드 | **심플 기본** + **localStorage로 마지막 모드 복원** | 신규 진입장벽↓ + 재방문 사용자 선호 유지. 첫 방문(저장값 없음)=심플 |
| 3 | 상태 공유 | 심플 "설명" = 어드밴스드 **스타일(stylePrompt)** 동일 state. 인스트루멘탈도 공유 | 어드밴스드 스타일도 자연어 묘사 허용 → 전환해도 텍스트 보존 |
| 4 | "+가사" 동작 | **Advanced로 전환** (설명은 스타일 필드에 유지, 가사 영역 노출) | "가사를 손보고 싶다 → 어드밴스드"가 자연스러움. 거기서 직접 입력 or 'AI 가사' 버튼 |
| 5 | 모델(심플) | **숨김, 선택 불가**. 보컬→`music-2.0`, 인스트루멘탈→`music-2.6` | 기존 컨벤션(2.0은 인스트루멘탈 미지원→2.6 전환)과 일치. 심플은 단순함 우선 |
| 6 | CTA 크레딧 | 어드밴스드와 **동일 표기** — 보컬(2.0)=2cr, 인스트루멘탈(2.6)=10cr. 토글에 따라 숫자 변동 | 비용 투명성 일관 |
| 7 | 제목 | 자동작사 응답의 **`song_title` 자동 사용**. 인스트루멘탈은 기존 inferTags/기본(null) | 제목 입력 없이도 이름 있는 곡 |
| 8 | 자동작사 게이트 | 심플 자동작사는 **`/api/lyrics` 레이트리밋(15초/1분2회) 미적용** — `lyrics.service.generateLyrics()` 직접 호출. 크레딧(음악 생성)이 게이트 | 심플 생성은 크레딧 차감 행위라 별도 연타 제한 불필요 |

## 4. UX 흐름

```
┌ [ Simple | Advanced ] 토글 (음악 만들기 상단)
│
├ SIMPLE
│   ┌─────────────────────────────────────────────┐
│   │ 설명                                          │
│   │ [ 만들고 싶은 노래를 자유롭게 설명해주세요     ] │  ← stylePrompt 공유
│   │   예) 싸움 후 침묵에 대한 감성적인 보사노바      │
│   │                                              │
│   │ [+ 가사]                         [인스트루멘탈]│  ← 인스트루멘탈 공유
│   └─────────────────────────────────────────────┘
│   [ 음악 만들기  ✦ 2 ]                              ← 2(보컬)/10(인스트루멘탈)
│
└ ADVANCED  (기존 폼: 제목·모델·가사(+AI가사)·스타일(+칩)·보컬 성별)
```

전환 규칙:
- **상단 토글 Simple↔Advanced**: stylePrompt·instrumental 등 공유 state 유지. 어드밴스드 전용 값(모델·제목·수동 가사)은 심플 생성 시 조용히 무시(어드밴스드 가면 복원)
- **"+가사"**: `setMode('advanced')` — 설명이 스타일 필드에 남고 가사 영역 노출
- **모드 영속화**: 전환 시 localStorage에 저장, mount 후 복원(하이드레이션 안전: 초기값 심플로 SSR → effect에서 복원)

## 5. 심플 "생성" 서버 흐름

기존 `/api/generate` 재사용 + 자동작사 분기. (API 키 서버 전용 유지)

```
클라(심플): POST /api/generate { mode:'simple', prompt: 설명, instrumental, ... }
  서버:
    1) 인증 · 모델 결정 (보컬→2.0 / 인스트루멘탈→2.6)
    2) 크레딧 선차감 (어드밴스드와 동일)
    3) songs INSERT (status=generating) → 즉시 응답
    4) after():
       - 보컬: generateLyrics(설명) → { lyrics, styleTags, songTitle }
                music_generation(prompt = styleTags + 설명, lyrics)
                title ← songTitle
       - 인스트루멘탈: 작사 생략, music_generation(prompt = 설명, is_instrumental)
       - 실패 시 status=failed + 환불 (기존 로직)
```

- `lyrics.service.generateLyrics`는 현재 `lyrics`(string)만 반환 → **`{ lyrics, styleTags, songTitle }`로 확장** 필요.
- 크레딧은 music 생성분만 (어드밴스드 동일). 자동작사는 추가 과금 없음.

### 5.1 어드밴스드 'AI 가사' 버튼도 제목 자동 채움 (함께 진행)

`generateLyrics` 확장(`songTitle` 노출)을 활용해, 어드밴스드의 'AI 가사' 팝업으로 가사를 만들면 **제목도 자동 채움**.
- `/api/lyrics` 응답에 `songTitle` 추가 (기존 `{lyrics}` → `{lyrics, songTitle}`)
- `LyricsGenerateModal.onGenerated`가 `(lyrics, songTitle)` 전달
- `SongForm.handleLyricsGenerated`: **제목이 비어 있을 때만** `setTitle(songTitle)` (사용자 입력 미덮어쓰기) + 토스트 "가사와 제목을 만들었어요"
- 스타일 태그는 자동반영 안 함 — "AI 가사는 내 프롬프트만 참조" 결정 유지 (`[[project-ui-conventions]]`)

## 6. 변경 영향 범위 (개략 — 상세는 design)

### 수정
- `features/song/components/SongForm.tsx` — mode 토글 + 심플 뷰 + 상태 공유 + localStorage 복원 + 심플 제출 분기 + handleLyricsGenerated 제목 자동 채움
- `app/api/generate/route.ts` — `mode/autoLyrics` 수신, 보컬 시 after()에서 자동작사 후 music 생성 + title=song_title
- `app/api/lyrics/route.ts` — 응답에 `songTitle` 추가
- `components/LyricsGenerateModal.tsx` — `onGenerated(lyrics, songTitle)` 전달
- `services/lyrics.service.ts` — `generateLyrics` 반환을 `{ lyrics, styleTags, songTitle }`로 확장
- (도우미) 모델 결정 로직 — 인스트루멘탈 토글 시 2.6, 아니면 2.0 (심플)

### 신규
- 없음(컴포넌트 신설 없이 SongForm 내부 뷰 분기). 필요 시 토글 UI 소형 컴포넌트만

### DB·마이그레이션
- 없음

## 7. Success Criteria

- [ ] 상단 Simple/Advanced 토글 노출 · 전환 동작
- [ ] 첫 방문 시 심플 기본, 이후 마지막 모드 복원 (localStorage)
- [ ] 심플: 설명 입력 + 생성 → 자동 작사된 곡 생성 (status=generating→done)
- [ ] 인스트루멘탈 토글 시 작사 생략 + 모델 2.6로 생성
- [ ] 보컬 심플 곡의 제목 = lyrics API `song_title`
- [ ] 어드밴스드 'AI 가사'로 생성 시 제목이 비어 있으면 `song_title` 자동 채움 (입력돼 있으면 유지)
- [ ] "+가사" → 어드밴스드 전환, 설명이 스타일 필드에 보존
- [ ] 토글 양방향 전환 시 설명·인스트루멘탈 보존
- [ ] CTA 크레딧 표기: 보컬 2 / 인스트루멘탈 10, 토글 따라 변동
- [ ] 크레딧은 음악 생성분만 차감 (자동작사 추가 과금 없음)
- [ ] `pnpm tsc --noEmit` 통과 · 모바일 실기기 확인

## 8. 보류 (2차)

- 심플 Suggestion 칩(주사위 랜덤 설명)
- `+ Voice`(보컬 참조), `+ Inspo`
- 심플에서 모델 노출/선택
- 플랜별 심플 기본 모델 차등

## 9. 작업 전 체크 (AGENTS.md / 컨벤션)

- ⚠️ "이건 평범한 Next.js가 아니다" — 라우트 수정 전 `node_modules/next/dist/docs/` 확인
- 한국어 UX: 친근 존댓말, 결과 과거형 (`[[project-ui-conventions]]`)
- 이벤트 detail 변경 없음(생성 흐름은 기존 useSongGeneration 재사용 예상) — design에서 확인
- 모델 분기: `services/minimax.service.ts` 컨벤션(2.0 vs 2.6 instrumental) 준수 (`[[feedback-code-pitfalls]]`)
