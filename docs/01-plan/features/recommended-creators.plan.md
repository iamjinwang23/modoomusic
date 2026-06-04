# recommended-creators Planning Document

> **Summary**: 둘러보기 "새로운 음악" 섹션 아래에 "추천 크리에이터" 가로 캐러셀 신설. 개인화 5명(내가 좋아요한 곡 작성자) + 트렌딩 2명(점수 풀 셔플) + 신규 1명(가입 30일 내) 하이브리드 8명 노출. 원형 아바타 카드 + 1탭 팔로우 버튼. 사람 단위 발견 채널을 만들어 팔로우·커뮤니티 형성 가속화.
>
> **Project**: 모두의 노래 (MONO)
> **Version**: 0.1.0
> **Author**: jinwang
> **Date**: 2026-06-04
> **Status**: Planning

---

## Executive Summary

| Perspective | Content |
|---|---|
| **Problem** | 둘러보기 페이지가 곡 단위 노출(에디터 추천·새로운 음악)만 있어 "사람" 발견 채널 부재. 좋아요·재생만으로는 작성자에게 관심이 이어지지 않아 팔로우·커뮤니티 형성이 약함 |
| **Solution** | 둘러보기 "새로운 음악" 섹션 아래에 **"추천 크리에이터"** 가로 캐러셀 신설. 개인화 5명(내가 좋아요한 곡 작성자) + 트렌딩 2명(활동 점수 Top 풀 셔플) + 신규 1명(가입 30일 내) **하이브리드 8명** |
| **Function/UX Effect** | 한 줄 캐러셀에 원형 아바타·닉네임·팔로우 수·1탭 팔로우 버튼. 카드 클릭 → 프로필 이동. 매번 셔플로 다른 사람 노출, cold start는 자동 발견 모드로 폴백 |
| **Core Value** | 사람 단위 발견 → 팔로우 활성화 → 커뮤니티 형성 → 리텐션·재방문↑. 신규 크리에이터에게 첫 팔로워 획득 기회 = 활성 창작 인구 양성 |

---

## Context Anchor

| Key | Value |
|---|---|
| **WHY** | 곡 단위 노출만으로는 "이 사람의 다음 곡도 듣고 싶다"는 관계 형성 어려움. 사람 발견 → 팔로우 → 알림 받기 → 재방문 루프가 SNS 핵심 |
| **WHO** | (1차) 좋아요·청취 활동 있는 사용자 → 개인화 적용 / (cold start) 신규 사용자 → 발견 모드 자동 폴백 / (수혜자) 신규 크리에이터(가입 30일 내) → 첫 팔로워 획득 기회 |
| **RISK** | (a) 필터 버블 — 개인화 위주면 "거의 고정 느낌", (b) Cold start — 활동 데이터 빈약 사용자 처리, (c) 양극화 — Top 인기인만 추천 = 모두에게 같은 8명, (d) 데이터 효율 — 매 요청마다 복잡 쿼리 |
| **SUCCESS** | (1) 캐러셀 클릭율 (impression → profile view) 8%+ (2) 사용자당 평균 신규 팔로우 +30% (4주 시점) (3) 신규 크리에이터(30일 내 가입)의 평균 첫 팔로워 획득 시간 단축 (4) 본인 노출·중복 노출 0건 |
| **SCOPE** | (In) 둘러보기 단일 섹션 / 한 줄 8명 / 5+2+1 하이브리드 알고리즘 / raw SQL 즉시 계산 / 원형 아바타 카드 + 1탭 팔로우 (Out) 전용 페이지·랭킹 차트·시그널 가중치 A/B 테스트·매트릭스 분해 / 비로그인 사용자 노출 (별도 처리) |

---

## 1. Overview

### 1.1 Purpose

탐색 페이지(둘러보기)에 "사람" 단위 발견 채널을 신설. 곡 단위 노출(에디터 추천·새로운 음악) 아래에 한 줄 가로 캐러셀로 8명 추천 노출. 1탭 팔로우 가능.

### 1.2 Background

- 현재 둘러보기: 곡 캐러셀 2개(`에디터 추천`·`새로운 음악`)만 노출 → 사람 발견 채널 없음
- 좋아요·재생을 해도 작성자 프로필 진입이 의도적 행동 필요 (아바타 클릭) → 팔로우 전환율 낮음
- SNS 본질: 사람 따라가는 알림 루프가 retention 핵심
- Spotify·Instagram·TikTok 모두 사람 단위 추천 섹션을 핵심 노출에 둠
- 우리는 데이터 작아 단순한 시그널 3개 가중 평균으로 시작 (Spotify·Instagram 단순화 버전)

### 1.3 Related Documents

- 둘러보기 hero·캐러셀 구조: `docs/02-design/features/today-song-mvp.design.md` §12.9
- 팔로우 API: `app/api/profiles/[id]/follow/route.ts`
- 댓글 시스템(사회적 검증 신호로 활용 가능): `docs/02-design/features/comments.design.md`

---

## 2. Scope

### 2.1 In Scope (1차 출시)

- [ ] 둘러보기(`/explore`) 메인에 **"추천 크리에이터" 단일 섹션** 추가 (`새로운 음악` 아래)
- [ ] **하이브리드 8명 노출** (5+2+1):
  - [ ] 개인화 5명 — 내가 좋아요한 곡 작성자 중 미팔로우, 최근 좋아요 desc
  - [ ] 트렌딩 2명 — 최근 7일 활동 점수 Top 30 풀에서 `RANDOM()` 셔플
  - [ ] 신규 부스트 1명 — 가입 30일 이내 + 곡 1개+ 게시 사용자 중 셔플
- [ ] **Cold start 폴백**: 개인화 5명 자리에 좋아요 데이터 없으면 자동으로 트렌딩 풀에서 채움
- [ ] **노출 제외 규칙**:
  - 본인 프로필
  - 이미 팔로우한 사용자
  - 곡 0개 사용자
  - 비로그인 시: 트렌딩 8명만 (개인화·신규 부스트 없음)
- [ ] **카드 UI** (원형 아바타·닉네임·팔로우 수·팔로우 알약 버튼)
- [ ] **카드 클릭** → 프로필 페이지 (`view-profile` 이벤트)
- [ ] **팔로우 버튼**: 1탭 팔로우, 이미 팔로우면 "팔로잉" 회색
- [ ] **셔플 dedup**: 같은 페이지에서 중복 노출 방지 (8명 distinct)
- [ ] **로딩 상태**: 스켈레톤 8개 (기존 SectionCarouselSkeleton 패턴 차용)
- [ ] **빈 상태**: 추천 결과 0명이면 섹션 숨김 (강제 노출 X)

### 2.2 Out of Scope (이번 단계 제외)

- 추천 사용자 전용 페이지 (`/explore/creators`)
- 분야별·장르별 크리에이터 차트
- 시즌제·랭킹 시스템
- 인증 마크 (1만 팔로워+ ✓)
- A/B 테스트로 시그널 가중치 미세 조정
- 매트릭스 분해·머신러닝 모델 (Phase 3 이후)
- 시간대별 추천 변화
- 알림 ("XX님을 팔로우해보세요" 푸시)
- 카드에 대표 곡 썸네일·재생 (Phase 2)
- "이미 본 카드 dedup" localStorage 처리 (Phase 2)

---

## 3. Requirements

### 3.1 Functional Requirements

#### FR-1 섹션 노출 위치
- 둘러보기 메인(`features/explore/components/ExplorePanel.tsx`)의 `HOME_SECTIONS.map` 직후 추가
- 모바일·데스크톱 동일 위치
- 위에 곡 캐러셀 2개, 아래에 추천 크리에이터 캐러셀

#### FR-2 하이브리드 알고리즘
- 단일 SQL 쿼리(CTE) 또는 RPC로 5+2+1명 fetch
- 클라이언트에서 합쳐 8명 렌더 (서버에서 합쳐서 반환도 OK)
- 순서: 개인화 5명 → 트렌딩 2명 → 신규 1명 (사용자에겐 비공개)

#### FR-3 노출 제외 / Edge Cases
- 본인 프로필 제외 (`profiles.id != $me`)
- 이미 팔로우한 사용자 제외 (`NOT EXISTS follows`)
- 곡 0개 사용자 제외 (`EXISTS public songs`)
- 비로그인: 트렌딩 8명만, 본인 검증·제외 로직 생략

#### FR-4 카드 UI
- 원형 아바타 (지름 80~96px, 모바일·데스크톱 별도)
- 닉네임 (1줄 truncate)
- 팔로워 수 (`{count}명` — 1k+ formatCount 활용)
- "+ 팔로우" 알약 버튼 (white bg, dark text)
- 이미 팔로우 (예외적으로 표시될 경우): "팔로잉" 회색
- 카드 hover: 살짝 scale·border 효과 (기존 PublicSongCard 톤)

#### FR-5 클릭 동작
- 카드(아바타·닉네임) 클릭 → `window.dispatchEvent(new CustomEvent('view-profile', { detail: username }))`
- 팔로우 버튼 클릭 → 기존 `/api/profiles/[id]/follow` API 호출 (낙관적 업데이트)
- 팔로우 후엔 즉시 "팔로잉" 회색 처리, 다음 새로고침에서 추천 풀에서 제외

#### FR-6 셔플 dedup
- 단일 쿼리 결과에서 distinct 보장 (개인화 결과에 이미 있는 사용자가 트렌딩에 또 안 나오게)
- `UNION` + `DISTINCT ON (id)` 또는 클라이언트 후처리로 처리

#### FR-7 비로그인 사용자
- 트렌딩 8명만 노출 (개인화·신규 부스트 자리 모두 트렌딩 풀에서 채움)
- 팔로우 버튼 클릭 시 `dispatchEvent(open-login)` (기존 패턴)

### 3.2 Non-Functional Requirements

| 항목 | 기준 |
|---|---|
| **응답 시간** | 추천 fetch 평균 200ms 이하 (사용자 1000명 규모) |
| **확장성** | 사용자 5000명+ 도달 시 raw SQL → cron 캐시 컬럼 전환 검토 (Phase 2) |
| **개인정보** | 추천 결과에 비공개 곡 작성자도 포함 가능. 공개 곡 작성자 위주 (`HAVING COUNT public songs >= 1`) |
| **모바일 친화** | 캐러셀 가로 스크롤, 좌우 화살표는 데스크톱만 |
| **로딩 UX** | 다른 섹션과 동일하게 shimmer skeleton |

---

## 4. Technical Design (High-Level)

### 4.1 데이터 소스 (변경 없음, 기존 컬럼만 활용)

- `profiles` — id, username, display_name, avatar_hue, avatar_url, follower_count, created_at
- `songs` — user_id, is_public, like_count, play_count, created_at
- `likes` — user_id (who liked), song_id (which song)
- `follows` — follower_id, following_id

→ **마이그레이션 불필요**, 신규 컬럼 없음.

### 4.2 신규 API 라우트

`GET /api/explore/recommended-creators`

- Auth: 선택 (로그인 시 개인화, 비로그인 시 트렌딩 8명)
- Response: `{ creators: Array<{ id, username, displayName, avatarHue, avatarUrl, followerCount }> }` 길이 0~8

### 4.3 SQL 전략 (1차)

단일 라우트에서 3개 CTE → UNION → 8명 distinct:

```sql
WITH
  liked AS (
    -- 내가 좋아요한 곡의 작성자 (미팔로우)
    SELECT p.*, 1 AS bucket, MAX(l.created_at) AS rank_key
    FROM likes l
    JOIN songs s ON s.id = l.song_id
    JOIN profiles p ON p.id = s.user_id
    WHERE l.user_id = $me AND s.user_id != $me
      AND NOT EXISTS (SELECT 1 FROM follows WHERE follower_id = $me AND following_id = s.user_id)
    GROUP BY p.id
    ORDER BY rank_key DESC
    LIMIT 5
  ),
  trending AS (
    -- 최근 7일 활동 점수 Top 30, 셔플 후 2개
    SELECT * FROM (
      SELECT p.*, 2 AS bucket, (SUM(s.like_count)*2 + SUM(s.play_count) + COUNT(*)*5) AS score
      FROM profiles p
      JOIN songs s ON s.user_id = p.id AND s.is_public AND s.created_at > NOW() - INTERVAL '7 days'
      WHERE p.id != $me AND p.id NOT IN (SELECT id FROM liked)
        AND NOT EXISTS (SELECT 1 FROM follows WHERE follower_id = $me AND following_id = p.id)
      GROUP BY p.id
      ORDER BY score DESC
      LIMIT 30
    ) t ORDER BY RANDOM() LIMIT 2
  ),
  new_creator AS (
    -- 가입 30일 내 + 곡 1개+
    SELECT p.*, 3 AS bucket, NULL AS rank_key FROM profiles p
    WHERE p.created_at > NOW() - INTERVAL '30 days'
      AND p.id != $me AND p.id NOT IN (SELECT id FROM liked) AND p.id NOT IN (SELECT id FROM trending)
      AND EXISTS (SELECT 1 FROM songs WHERE user_id = p.id AND is_public)
      AND NOT EXISTS (SELECT 1 FROM follows WHERE follower_id = $me AND following_id = p.id)
    ORDER BY RANDOM()
    LIMIT 1
  )
SELECT * FROM liked
UNION ALL SELECT * FROM trending
UNION ALL SELECT * FROM new_creator;
```

비로그인 시: trending 단독, LIMIT 8.

### 4.4 신규 컴포넌트

- `features/explore/components/RecommendedCreators.tsx` — 캐러셀 (가로 스크롤, 화살표·페이드)
- `features/explore/components/CreatorCard.tsx` (또는 RecommendedCreators 내부 인라인) — 카드 UI

### 4.5 클라이언트 fetch

- ExplorePanel mount 시 한 번 fetch
- Realtime 구독 불필요 (셔플 결과는 새로고침 시점 기준)
- 빈 결과 → 섹션 자체 숨김

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 필터 버블 (개인화 위주 = 같은 사람만 반복) | 사용자 피로 | 트렌딩 2명 + 신규 1명 `RANDOM()` 셔플로 변동성 보장. Phase 2에서 localStorage dedup |
| Cold start (활동 데이터 0인 신규) | 개인화 비효율 | 자동 폴백: liked CTE 결과 0이면 trending이 자리 채움 |
| 양극화 (Top 인기인만 노출) | 모두에게 같은 8명 | 트렌딩 풀을 Top 30으로 넓히고 RANDOM 셔플 |
| 단일 쿼리 부담 | 응답 시간 ↑ | 1차는 raw SQL OK (1000명 규모). 5000명+ 도달 시 cron 캐시 컬럼 도입 |
| 본인 노출 / 이미 팔로우 노출 | UX 깨짐 | 모든 CTE에 명시적 제외 절. 클라이언트도 한 번 더 검증 |
| 곡 0개 빈 프로필 | 클릭해도 휑함 | trending·new_creator 모두 `EXISTS songs` 필터, liked는 좋아요 곡이 있으므로 자연 충족 |
| RANDOM 일관성 부재 | 새로고침마다 완전 다른 결과 | 의도된 사항. Phase 2에서 "오늘의 추천" 일자 고정 시드로 보완 가능 |
| 비로그인 사용자 노출 | 무한 새로고침 = bot risk | 1차에는 일반 노출. 비로그인이 너무 많으면 Phase 2에서 rate limit |

---

## 6. Success Criteria

각 항목은 1차 출시 후 4주 시점 측정.

- [ ] "추천 크리에이터" 섹션 정상 노출 (모바일·데스크톱)
- [ ] 5+2+1 비율 알고리즘 작동, 모든 노출 제외 규칙 통과
- [ ] Cold start (신규 가입자) 자동 폴백 정상
- [ ] 캐러셀 impression → profile view 클릭율 **8%+**
- [ ] 캐러셀 노출 → 팔로우 클릭율 **3%+**
- [ ] 사용자당 평균 신규 팔로우 수 (캐러셀 도입 전 대비) **+30%**
- [ ] 신규 크리에이터(가입 30일 내) 평균 첫 팔로워 획득 시간 단축 (전/후 비교)
- [ ] 추천 결과 평균 응답 시간 **200ms 이하**
- [ ] 본인 노출·이미 팔로우 노출·중복 노출 **0건**
- [ ] 빈 결과 시 섹션 숨김 정상 동작

---

## 7. Next Steps

1. **(다음) Design 문서 작성** — Architecture 3가지 옵션 (RPC vs API route vs 클라이언트 직접), Module Map, Session Guide
2. **SQL 쿼리 검증** — 실제 DB에서 EXPLAIN ANALYZE, 인덱스 부족 확인
3. **Do 구현 세션** (단일 세션 ~2~3시간 예상):
   - API 라우트 + SQL CTE
   - RecommendedCreators 컴포넌트
   - ExplorePanel 통합
   - 스켈레톤 로딩
   - 수동 QA
4. **(Phase 2 후보)** Phase 1 출시 후 2~4주 데이터 측정 후:
   - 카드에 대표 곡 썸네일 추가
   - localStorage dedup (이미 본 사람 노출 우선순위 ↓)
   - 시그널 가중치 A/B 테스트
   - "일자 고정 시드" 도입으로 "오늘의 추천" 안정화
   - 5000명+ 도달 시 cron 캐시 컬럼 + 별도 테이블
