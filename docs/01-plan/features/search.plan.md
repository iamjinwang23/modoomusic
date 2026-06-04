# search Planning Document

> **Summary**: 둘러보기 본문 상단 우측에서 진입하는 통합 검색 — 곡·사용자·태그를 Instagram 탭 패턴으로 분리 노출, 최근 검색어 10개 저장
>
> **Project**: MONO (모두의 노래)
> **Author**: iamjinwang@gmail.com
> **Date**: 2026-06-04
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 추천·둘러보기는 알고리즘 발견이지만 "타깃 명확한 찾기"가 불가능. 곡명·작성자명·장르명 자유 텍스트로 진입할 수단 없음 — 1차 SNS 핵심 4종(팔로우·댓글·추천·검색) 중 마지막 |
| **Solution** | 둘러보기 본문 상단 우측에 검색 UI(MyWorkPanel 검색 패턴 차용) + Instagram 탭 분리 결과(전체/곡/사용자/태그) + localStorage 10개 최근 검색어 |
| **Function/UX Effect** | 모바일: 아이콘→폭 모핑 오버레이 / 데스크톱: 항상 펼침. 결과 클릭 시 곡=상세, 사용자=프로필, 태그=둘러보기 필터 자동 적용 |
| **Core Value** | 알고리즘 발견 + 자유 텍스트 찾기 양립 → 사용자가 다시 듣고 싶은 곡·재방문하고 싶은 사람을 한 번에. 1차 SNS 완성 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 1차 SNS 4종 中 마지막 미구현 항목. 추천만으론 "그 곡 다시 듣기" / "그 사람 다시 찾기" 불가 |
| **WHO** | 곡 작성자(자기 곡과 별개 — MyWorkPanel 검색은 본인 곡만), 모든 둘러보기 방문자 |
| **RISK** | Postgres ILIKE 풀스캔(인덱스 부재) / 비공개 곡 노출 사고 / 가사 검색 시 TEXT 컬럼 부하 |
| **SUCCESS** | 검색 진입율(둘러보기 → 검색) 측정, 결과 클릭율 측정, 평균 응답 < 300ms (이후 GA4로 검증) |
| **SCOPE** | 둘러보기 본문 상단 우측 검색 UI + 통합 검색 API + 4탭 결과 + 최근 검색어 + 태그 클릭 시 필터 적용 |

---

## 1. Overview

### 1.1 Purpose

둘러보기 페이지 본문 상단 우측에 검색 진입점을 추가해 곡·사용자·태그 자유 텍스트 검색을 제공한다. MyWorkPanel(내 음악) 검색과는 완전 분리된 별개 state·핸들러.

### 1.2 Background

- 추천 크리에이터(2026-06-04 출시) 직후, 1차 SNS 완성을 위한 마지막 핵심
- 둘러보기는 "발견"(추천·트렌딩), 검색은 "찾기"(타깃 명확) — 보완 관계
- 데이터 인프라 준비됨: 곡 18개+, 장르 19개+무드 11개, profiles·songs·tags 컬럼 다 있음

### 1.3 Related Documents

- 추천 크리에이터: `docs/01-plan/features/recommended-creators.plan.md` (SNS 4종 中 직전)
- 탐색 칩 추출: `utils/extractTags.ts` (장르 19/무드 11 사전)
- MyWorkPanel 검색: `features/song/components/MyWorkPanel.tsx:215-280` (UI 패턴 참조)

---

## 2. Scope

### 2.1 In Scope

- [ ] 둘러보기 본문 상단 우측 검색 UI (MyWorkPanel 검색 패턴: 모바일 아이콘→폭 모핑 오버레이 / 데스크톱 항상 펼침)
- [ ] **MyWorkPanel과 완전 분리** (state·컴포넌트 별개)
- [ ] 검색 input 입력 시 debounce 300ms로 자동 fetch
- [ ] 결과 레이아웃: Instagram 탭 패턴 — `[전체 | 곡 | 사용자 | 태그]`
- [ ] **전체 탭**: 곡 6개 + 사용자 5개 + 태그 3개 미리보기 (각 섹션 "더보기" → 해당 탭 이동)
- [ ] **곡 탭**: 제목·prompt·자동 추출 장르/무드 ILIKE (공개 곡만, 비공개 절대 노출 X)
- [ ] **사용자 탭**: username·display_name ILIKE
- [ ] **태그 탭**: GENRE_LABELS·MOOD_LABELS exact + ILIKE 매칭
- [ ] 최근 검색어: localStorage 10개, 검색창 포커스 시 칩 표시, 칩에 개별 X + "전체 지우기"
- [ ] 빈 결과: "검색 결과가 없어요" + (선택) 트렌딩 곡 추천
- [ ] 결과 클릭 동작:
  - 곡 → `view-song` 이벤트 (origin: 'search')
  - 사용자 → `view-profile` 이벤트
  - 태그 → 둘러보기 필터 자동 적용 + 검색 종료
- [ ] 검색 페이지·라우트 신설 X — 둘러보기 안 패널 전환 (`searchOpen` state)
- [ ] ESC 또는 X → 검색 종료 + 둘러보기 원상복귀
- [ ] GA4 이벤트: `search_perform { query_length, result_count }`, `search_result_click { type: 'song'|'user'|'tag' }`

### 2.2 Out of Scope

- 음성 검색 / 이미지 검색
- 검색어 자동완성(Autocomplete suggestions API) — 1차는 입력 후 결과만
- 인기 검색어 / 추천 검색어
- 가사 전체 검색 (`lyrics` 컬럼 ILIKE — TEXT 부하)
- 댓글 검색
- 검색 결과 무한 스크롤 (1차 곡 30, 사용자 20, 태그 모두로 LIMIT)
- Elasticsearch / Algolia / Meilisearch 외부 검색 서비스
- 검색 결과 정렬 옵션 (1차 곡=좋아요+재생수 점수, 사용자=팔로워 수)
- 트렌딩 검색어 표시 (Phase 2)
- 헤더 전역 검색 진입점 (둘러보기 본문 상단 우측 only)

### 2.3 의도된 차이

- **MyWorkPanel 검색**: 본인 곡만 (전체/좋아요/게시 필터 + 검색) — 라이브러리 컨텍스트
- **이번 검색**: 공개 곡 + 모든 사용자 + 태그 — 둘러보기 컨텍스트
- 둘이 같은 패널에 있지 않으므로 충돌 0. 컴포넌트·state 완전 분리

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 둘러보기 본문 상단 우측에 검색 아이콘(모바일)·입력 박스(데스크톱) 노출 | High | Pending |
| FR-02 | 검색 활성 시 둘러보기 본문(피드+추천 크리에이터)이 결과 패널로 전환, 비활성 시 복귀 | High | Pending |
| FR-03 | 입력 300ms debounce 후 `GET /api/search?q=...`로 통합 검색 fetch | High | Pending |
| FR-04 | 응답: `{ songs: [...], users: [...], tags: [...] }` 구조 | High | Pending |
| FR-05 | 4탭 UI (`[전체 | 곡 | 사용자 | 태그]`) + 전체 탭은 미리보기 + "더보기" | High | Pending |
| FR-06 | 곡 검색: 제목·prompt·genre·mood ILIKE, `is_public = true` 필수 | High | Pending |
| FR-07 | 사용자 검색: username·display_name ILIKE, 본인 노출 가능 (자기 프로필 진입 흐름) | High | Pending |
| FR-08 | 태그 검색: GENRE_LABELS·MOOD_LABELS 매칭 (사전 기반) + ILIKE 보강 | Medium | Pending |
| FR-09 | 최근 검색어 localStorage 10개, FIFO, 포커스 시 칩 표시 | Medium | Pending |
| FR-10 | 빈 결과 처리 + 트렌딩 곡 3~5개 폴백 (선택) | Medium | Pending |
| FR-11 | 결과 클릭 액션 (곡=상세 / 사용자=프로필 / 태그=둘러보기 필터) | High | Pending |
| FR-12 | ESC 또는 X 버튼 → 검색 종료 | High | Pending |
| FR-13 | GA4 wiring: `search_perform`, `search_result_click` | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 응답 시간 < 300ms (현재 데이터 규모 1만 row 이하 예상) | curl + Network 탭 |
| Privacy | 비공개 곡 절대 노출 금지 | API 응답 manual 검증 + RLS 정책 확인 |
| Mobile UX | 아이콘→폭 모핑 transition `duration-300 ease-out` (MyWorkPanel 동일) | 시각 확인 |
| 안전성 | 검색어 빈 문자열·whitespace만 → API 호출 0 | 코드 검증 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 둘러보기 본문 상단 우측에 검색 UI 노출 (모바일·데스크톱 모두)
- [ ] 4탭 결과 정상 노출 + 빈 결과 처리
- [ ] 곡·사용자·태그 각 카테고리 정상 검색 + 비공개 곡 0건 노출
- [ ] 최근 검색어 저장·표시·삭제
- [ ] 태그 클릭 → 둘러보기 필터 자동 적용
- [ ] ESC·X 종료
- [ ] GA4 이벤트 발사 확인

### 4.2 Quality Criteria

- [ ] TypeScript strict 통과
- [ ] 빈 query·whitespace 가드
- [ ] 검색 결과 클릭 시 origin 정보 전파 (analytics)
- [ ] 모바일·데스크톱 UX 회귀 없음

### 4.3 Outcome Criteria (출시 4주 후 GA4)

- [ ] 검색 진입율: 둘러보기 방문의 15%+
- [ ] 검색 결과 클릭율: 검색 수행의 30%+
- [ ] 평균 응답 < 300ms

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Postgres ILIKE 풀스캔 → 느림 | Medium | Medium | 1차 인덱스 없이 출시. 1만 row 이하 OK. Phase 2에 `gin (...) USING gin (... gin_trgm_ops)` |
| 비공개 곡 노출 사고 | High | Low | 모든 곡 SELECT에 `is_public = true` 강제 + RLS도 동작 |
| 빈 검색·whitespace로 풀 fetch | Medium | High | 클라이언트 + 서버 양쪽 트림 + 최소 1자 |
| 가사 검색 부담 | - | - | 1차 제외로 회피 (스코프 X) |
| MyWorkPanel과 코드 패턴 중복 | Low | Medium | 패턴 차용은 OK, state 완전 분리. 헬퍼 추출은 Phase 2 |
| 태그 클릭 시 검색 종료가 사용자에게 갑작스러움 | Low | Low | 태그 칩 활성 상태로 시각 신호. 검색 input 비움 + 결과 패널 닫음 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `app/api/search/route.ts` | API | **신규** — `GET /api/search?q=...&tab=...` |
| `services/search.service.ts` | Service | **신규** — 곡·사용자·태그 동시 fetch |
| `features/explore/components/ExplorePanel.tsx` | Component | 상단 우측 검색 UI 추가, searchOpen·query state 추가, 검색 활성 시 결과 패널 노출 |
| `features/explore/components/SearchPanel.tsx` | Component | **신규** — 검색 결과 탭·리스트 |
| `features/explore/components/RecentSearches.tsx` | Component | **신규** — localStorage 칩 |
| `utils/analytics.ts` | Const | `SEARCH_PERFORM`·`SEARCH_RESULT_CLICK` 이벤트 상수 추가 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `ExplorePanel` | render | 둘러보기 페이지 진입 모든 사용자 | 수정 — 상단 검색 영역 추가. 기존 hero·섹션은 그대로 |
| `useOptimisticToggle` | follow | 검색 결과 사용자 카드에도 사용 | None — 기존 패턴 재사용 |

### 6.3 Verification

- [ ] 검색 비활성 시 기존 둘러보기 UX 무영향
- [ ] 모바일 검색 활성 시 ExploreHero·SectionCarousel 가려지지 않고 결과만 노출
- [ ] 비공개 곡 SELECT 0건 (manual SQL 검증)

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

Dynamic (변경 없음)

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 검색 UI 위치 | 헤더 전역 / 둘러보기 본문 / 별도 라우트 | 둘러보기 본문 상단 우측 | 사용자 명시. 발견 컨텍스트와 인접 |
| UI 패턴 | 새 패턴 / MyWorkPanel 차용 | MyWorkPanel 차용 | 사용자 명시. 일관성 |
| State 공유 | 헬퍼 추출 / 완전 분리 | 완전 분리 | 사용자 명시. 컨텍스트(내 음악 vs 공개 곡) 다름 |
| 결과 레이아웃 | Spotify 섹션 / Instagram 탭 / 하이브리드 | Instagram 탭 | 사용자 명시. 각 카테고리 깊이 노출 |
| 검색 엔진 | Postgres ILIKE / pg_trgm / FTS / Algolia | Postgres ILIKE | 마이그레이션 0, 데이터 규모 작음. Phase 2에 인덱스 고려 |
| API 구조 | 단일 통합 / 카테고리 분리 | 단일 통합 (`/api/search`) | 1회 round trip, 4탭 미리 모두 fetch |
| Debounce | 200/300/500ms | 300ms | UX 표준 |
| 최근 검색어 | DB / localStorage / 없음 | localStorage 10개 | 사용자 명시. 사용자별 분산 X, 빠름 |
| 태그 클릭 동작 | 태그 페이지 / 둘러보기 필터 적용 | 둘러보기 필터 적용 | 사용자 명시. 라우트 추가 없음 |

### 7.3 Folder Structure

```
app/api/search/
  route.ts                    # NEW

services/
  search.service.ts           # NEW

features/explore/components/
  ExplorePanel.tsx            # MODIFIED — 상단 우측 검색 영역, searchOpen state
  SearchPanel.tsx             # NEW — 4탭 결과 리스트
  RecentSearches.tsx          # NEW — localStorage 칩

utils/
  analytics.ts                # MODIFIED — SEARCH_PERFORM, SEARCH_RESULT_CLICK
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] CLAUDE.md, Next.js 16 변경 사항 주의
- [x] Tailwind v4
- [x] Supabase SSR auth
- [x] useOptimisticToggle 패턴
- [x] view-song / view-profile 이벤트 디스패치

### 8.2 Conventions to Define

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 검색 입력 debounce | missing | 300ms 표준 | Medium |
| ILIKE 패턴 | 부분 사용 (MyWorkPanel) | `%${query}%` 양 끝 와일드카드, query.trim() | High |
| LocalStorage 키 | `mono.*` 네임스페이스 (예: `mono.songform.mode`) | `mono.search.recent` | Low |

### 8.3 Environment Variables Needed

추가 없음.

---

## 9. Next Steps

1. [ ] `/pdca design search` — 3 아키텍처 옵션 비교 + Option 선택
2. [ ] `/pdca do search` — 구현
3. [ ] 수동 QA 체크리스트
4. [ ] (Phase 2) pg_trgm 인덱스 (`CREATE INDEX songs_title_trgm ON songs USING gin (title gin_trgm_ops)`)
5. [ ] (Phase 2) 가사 검색 + 댓글 검색
6. [ ] (Phase 2) 인기 검색어 / 자동완성

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-04 | Initial draft (요구사항 4 결정 반영) | iamjinwang@gmail.com |
