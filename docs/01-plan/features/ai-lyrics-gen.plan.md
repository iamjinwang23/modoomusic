# ai-lyrics-gen Planning Document

> **Summary**: 가사 입력 영역에 "AI 가사 생성" 버튼을 추가 — 팝업에서 사용자가 프롬프트를 입력하면 MiniMax 가사 생성 전용 API(`/v1/lyrics_generation`)로 `[Verse][Chorus][Bridge]` 등 구조 태그가 포함된 깨끗한 가사를 생성해 textarea에 채움. 플랫폼 크레딧은 소모하지 않되 사용자별 1일 횟수 제한.
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
| **Problem** | 사용자가 직접 가사를 써야 하는 진입 장벽. 일반 LLM으로 가사를 받으면 효과음·분위기 지문이 섞여 MiniMax 곡 생성이 그걸 가사로 인식해 노래로 불러버림 |
| **Solution** | 가사 섹션에 "AI 가사 생성" 버튼 + 프롬프트 팝업. MiniMax **전용 가사 생성 API**(`/v1/lyrics_generation`, `mode: write_full_song`)로 곡 생성용으로 검증된 구조 태그 가사만 받아 textarea에 반영 |
| **Function/UX Effect** | 프롬프트 한 번 입력 → 구조 태그 포함 가사 자동 완성 → 그대로 곡 생성. 크레딧 미소모라 부담 없이 여러 번 시도 가능(단 1일 횟수 제한) |
| **Core Value** | "가사를 못 써서 못 만드는" 사용자를 곧바로 생성 단계로. 전용 API라 효과음/지문 오염 없이 음악 API와 포맷 호환 |

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 가사 작성 장벽 제거 + 일반 LLM 가사의 "지문 오염" 문제를 MiniMax 전용 엔드포인트로 원천 차단 |
| **WHO** | 직접 가사를 쓰기 어렵거나 빠르게 초안이 필요한 모든 생성 사용자 |
| **RISK** | (1) 가사 API 연타 → MiniMax RPM(`status_code 1002`) 또는 비용. 연타 방지 레이트리밋으로 방어 (2) prompt 상한 2000자 (3) 레이트리밋 타임스탬프를 profiles에 두되 기존 크레딧 컬럼과 충돌 없이 추가 |
| **SUCCESS** | 버튼 → 팝업 → 생성 → textarea 채움이 끊김 없이 동작 · 크레딧 미차감 · 레이트리밋(15초/1분2회) 초과 시 한국어 스낵바(카운트다운 미표시) · 효과음/지문 없는 구조 태그 가사 |
| **SCOPE** | 모달 1개 + API 라우트 1개 + lyrics.service(생성+레이트리밋) + profiles 타임스탬프 2컬럼 + SongForm 버튼/핸들러. 가사 "이어쓰기(edit mode)"·다국어 옵션은 비포함 |

---

## 1. Goals

- 가사 섹션 "AI 가사 생성" 버튼 → 프롬프트 팝업 → 생성 → 가사 textarea 자동 채움
- MiniMax **전용 가사 생성 API** 사용 (곡 생성 API의 `lyrics_optimizer` 아님 → 비용/구조 분리)
- 생성 결과는 구조 태그(`[Verse]`/`[Chorus]`/`[Bridge]` 등)만 포함, 효과음·분위기 지문 배제
- 플랫폼 크레딧 **미소모**, 단 **연타 방지 레이트리밋** (15초 쿨다운 + 1분 2회)
- API 키는 서버 전용 (클라이언트 노출 금지 → 서버 라우트 경유)

## 2. Non-Goals (1차)

- 가사 **이어쓰기/편집**(API `mode: edit`) — 1차는 `write_full_song`만
- 생성된 `song_title`·`style_tags`를 폼의 제목/장르·무드에 자동 반영 (사용자가 "스타일 참조 안 함, 내 프롬프트만" 요구 → 미반영)
- 다국어/길이 옵션 선택 UI
- 생성 이력 저장·재생성 히스토리
- 인스트루멘탈 모드에서 노출 (가사 섹션이 접혀 있을 땐 버튼도 숨김)

## 3. 핵심 결정 사항

| # | 결정 | 채택 | 이유 |
|---|---|---|---|
| 1 | 엔드포인트 | `POST https://api.minimax.io/v1/lyrics_generation`, `mode: write_full_song` | 전용 가사 API. 곡 미생성 → 음악 크레딧 비용 없음. RPM 제한만 존재 |
| 2 | 요청 파라미터 | `prompt`만 전달 (스타일/제목 미전달) | 사용자: "스타일 참조 안 함, 내 프롬프트만 참조" |
| 3 | 프롬프트 길이 | 우리 UI는 제한 없음 표기, 단 전송 시 API 상한 **2000자**로 캡 | API `maxLength: 2000` (초과 시 2013 오류) |
| 4 | 반영 방식 | **전체 교체** — 기존 가사 있으면 확인 후 교체 | 사용자 선택 (Recommended) |
| 5 | 플랫폼 리밋 | **연타 방지 레이트리밋** (총량 제한 X). 15초 쿨다운 + 1분 2회 | 크레딧 비용이 없어 총량 제한 명분 약함. 실제 리스크는 단기 폭주 → MiniMax RPM(1002) |
| 6 | 리밋 저장 | `profiles`에 `last_lyrics_gen_at` + `prev_lyrics_gen_at` (timestamptz, nullable). 쿨다운=`now−last<15s`, 1분2회=`now−prev<60s` 차단. 성공 시 prev←last, last←now | 컬럼 2개로 두 규칙 충족. 리셋 로직 불필요. 서버리스 메모리 리밋은 인스턴스 휘발로 부적합 |
| 6a | 차단 UX | 초과 시 스낵바 "잠시 후 다시 시도해 주세요". **쿨다운 잔여 시간 미표시**. 클라는 요청 중 버튼 비활성만 | 사용자 선택 (카운트다운 노출 안 함) |
| 7 | 효과음/지문 차단 | 전용 API가 곡 생성용 포맷을 출력하므로 1차 방어. 추가로 응답 후 비-구조 대괄호 지문(예: `[soft piano]`) 한정 sanitize | `(Ooh-ooh)` 류 보컬 애드립은 의도된 가창이라 유지 |
| 8 | API 키 보호 | 서버 라우트 `app/api/lyrics/route.ts` 경유 | `MINIMAX_API_KEY` 클라 노출 금지 (기존 generate 라우트와 동일 패턴) |
| 9 | 인증 | 로그인 사용자만 (일일 카운터가 user 기준) | 비로그인은 버튼 비활성/로그인 유도 |

## 4. MiniMax 가사 생성 API 스펙 (확정)

**요청** — `POST /v1/lyrics_generation`, `Authorization: Bearer ${MINIMAX_API_KEY}`, `Content-Type: application/json`

```json
{ "mode": "write_full_song", "prompt": "<사용자 프롬프트, ≤2000자>" }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `mode` | string | ✅ | `write_full_song` \| `edit`. 1차는 `write_full_song` |
| `prompt` | string | — | 주제/스타일/방향. 빈 값이면 랜덤. maxLength 2000 |
| `lyrics` | string | — | `edit` 모드 전용 (1차 미사용) |
| `title` | string | — | 미전달 |

**응답** — `GenerateLyricsResp`

```json
{
  "song_title": "...",
  "style_tags": "Pop, Upbeat, Female Vocals",
  "lyrics": "[Intro]\n...\n[Verse 1]\n...\n[Chorus]\n...",
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

- 사용 필드: **`lyrics`만** textarea에 반영 (`song_title`/`style_tags`는 무시 — 결정 #2)
- 지원 구조 태그(14): `[Intro] [Verse] [Pre-Chorus] [Chorus] [Hook] [Drop] [Bridge] [Solo] [Build-up] [Instrumental] [Breakdown] [Break] [Interlude] [Outro]`

**status_code 처리**

| code | 의미 | 우리 처리 |
|---|---|---|
| 0 | 성공 | lyrics 반영 |
| 1002 | Rate limit | "지금 너무 많이 생성되고 있어요. 잠시 후 다시 시도해 주세요" |
| 1004 / 2049 | 인증 실패 | "서버 인증 문제가 생겼어요" |
| 1008 | 잔액 부족 | "서비스 크레딧이 부족해요. 관리자에게 문의해 주세요" |
| 1026 | 민감 콘텐츠 | "입력한 내용이 정책에 맞지 않아요. 다른 표현으로 시도해 주세요" |
| 2013 | 잘못된 파라미터 | "요청에 문제가 있어요" |

→ 기존 `translateMinimaxError`를 status_code 기반으로 확장하거나 별도 매핑 추가.

## 5. UX 흐름

```
[가사 섹션 헤더]  가사            (인스트루멘탈 토글)
                  └ "AI 가사 생성" 버튼 (sparkles 아이콘)
        │ click
        ▼
[LyricsGenerateModal]  (SongEditModal 패턴: 타이틀 + X · 본문 · 푸터)
  - 프롬프트 textarea ("어떤 노래를 만들까요? 자유롭게 적어주세요")
  - [생성하기] 버튼
        │ submit → POST /api/lyrics  (요청 중 버튼 비활성)
        ▼
  - 로딩 상태 (스피너)
        │ 성공                              │ 429 (레이트리밋)
        ▼                                   ▼
  - 기존 가사 있으면 교체 확인           - 스낵바 "잠시 후 다시 시도해 주세요"
  - setLyrics(생성 결과)                   (잔여 시간 미표시)
  - 모달 닫힘 → 토스트 "가사를 만들었어요"
```

- 모바일: `items-end + rounded-t-2xl` 바텀시트, 데스크톱: `items-center + rounded-2xl` (`[[project-ui-conventions]]` 모달 컨벤션)
- 버튼/아이콘: sparkles SVG 통일, hover 시 텍스트 white (이모지 금지)
- 인스트루멘탈 ON(가사 섹션 접힘) 시 버튼 미노출

## 6. 파일 구조 (변경 영향 범위)

### 신규
- `components/LyricsGenerateModal.tsx` — 프롬프트 입력 팝업
- `app/api/lyrics/route.ts` — 인증 → 일일 리밋 체크 → `generateLyrics()` 호출 → 결과 반환
- `docs/01-plan/features/ai-lyrics-gen.plan.md` (이 문서)
- (DB) 일일 가사 생성 카운터 — `5월 마이그레이션`로 추가 (§7)

### 수정
- `services/minimax.service.ts` — `generateLyrics(prompt)` 함수 + status_code 매핑 추가
- `features/song/components/SongForm.tsx` — 가사 섹션에 버튼 + 모달 연결 + `setLyrics` 핸들러
- `services/credit.service.ts` 또는 신규 `services/lyrics-limit.service.ts` — 일일 카운터 read/increment (KST 리셋 재사용)

### DB·API
- 카운터 저장소 1개 (§7), 신규 라우트 1개

## 7. 레이트리밋 저장 (확정)

크레딧은 `profiles.daily_credits_used` + `last_credit_reset_at`에 저장(008 마이그레이션, KST 자정 리셋). 가사 레이트리밋은 **크레딧과 독립**된 타임스탬프 2개를 profiles에 추가.

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_lyrics_gen_at timestamptz,
  ADD COLUMN IF NOT EXISTS prev_lyrics_gen_at timestamptz;
```

서버 체크 (성공 시에만 시프트):

```ts
const now = Date.now()
const last = profile.last_lyrics_gen_at ? +new Date(profile.last_lyrics_gen_at) : 0
const prev = profile.prev_lyrics_gen_at ? +new Date(profile.prev_lyrics_gen_at) : 0
if (last && now - last < 15_000) return rateLimited()   // 15초 쿨다운
if (prev && now - prev < 60_000) return rateLimited()   // 최근 1분에 이미 2회
// ...generateLyrics 성공 후...
update({ prev_lyrics_gen_at: profile.last_lyrics_gen_at, last_lyrics_gen_at: new Date(now).toISOString() })
```

- 타임스탬프 갱신은 **MiniMax 성공(status_code 0) 시에만** (실패·차단 시 갱신 안 함)
- 마이그레이션은 수동 적용(Supabase SQL Editor) — `[[feedback-code-pitfalls]]` MCP 권한 없음·drift 주의

## 8. 효과음/지문 오염 방어

1. **1차 방어 (구조적)**: 전용 가사 API는 곡 생성 API와 포맷 호환 출력 → 일반 LLM 대비 지문 오염 거의 없음
2. **2차 방어 (선택, 경량)**: 응답 `lyrics`에서 **구조 태그 14종이 아닌 대괄호 라인**(예: `[soft piano intro]`, `[wind sfx]`)만 제거. 괄호 `( )` 보컬 애드립은 유지(의도된 가창)
   - 화이트리스트: 위 14개 태그(대소문자/하이픈 변형 허용)
   - YAGNI: 실제 오염 사례 확인 전엔 과한 정규화 지양 — 최소 필터만

## 9. Success Criteria

- [ ] 가사 섹션에 "AI 가사 생성" 버튼 노출 (인스트루멘탈 시 숨김)
- [ ] 버튼 클릭 → 프롬프트 팝업 (모달 컨벤션 준수, 모바일 바텀시트)
- [ ] 프롬프트 입력 → `/api/lyrics` 호출 → 구조 태그 포함 가사 생성
- [ ] 결과가 가사 textarea에 반영 (기존 내용 있으면 교체 확인)
- [ ] **크레딧 미차감** (credit 카운터 불변 확인)
- [ ] 15초 내 재시도 차단 + 1분 내 3번째 차단 → 스낵바 "잠시 후 다시 시도해 주세요" (잔여 시간 미표시)
- [ ] 정상 사용(간격 충분)은 차단되지 않음
- [ ] MiniMax `status_code` 1002/1004/1026 등 한국어 매핑
- [ ] `MINIMAX_API_KEY`가 클라이언트 번들에 노출되지 않음 (서버 라우트 경유)
- [ ] prompt 2000자 초과 시 캡 처리
- [ ] `pnpm tsc --noEmit` 통과 · 모바일 실기기 확인

## 10. 보류 (2차)

- 가사 이어쓰기/부분 편집 (`mode: edit` + 선택 영역 전달)
- `style_tags`/`song_title` 활용한 폼 자동 채움 (옵트인)
- 생성 이력·재생성 비교
- 다국어/길이/분위기 옵션
- 레이트리밋 플랜별 완화 (Plus/Pro는 쿨다운 단축 등)

## 11. 작업 전 체크 (AGENTS.md)

- ⚠️ "이건 평범한 Next.js가 아니다" — 라우트 작성 전 `node_modules/next/dist/docs/`의 Route Handler 가이드 확인
- 서버 클라이언트 함정: 인증은 `createUserClient()`, 카운터 UPDATE는 필요 시 `createAdminClient()` (`[[feedback-code-pitfalls]]`)
- 한국어 UX: 모든 노출 텍스트 한국어 친근 존댓말, 결과 과거형
